"""Export this repository's fixed Keras network to ONNX; no retraining.

Only load trusted upstream pickle files. The exporter deliberately rejects
architectures it does not implement. LSTM gates keep Keras order i,f,c,o.
"""
import ast
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import joblib
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import tensorflow as tf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app/model"
OUT = ROOT / "web/public/model"
FIXTURES = ROOT / "web/tests/fixtures"


def source_features(path):
    """Execute only the original pure feature method, without camera/Flask imports."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef))
    method = next(n for n in cls.body if isinstance(n, ast.FunctionDef)
                  and n.name == "extract_window_features")
    scope = {"np": np}
    exec(compile(ast.Module(body=[method], type_ignores=[]), str(path), "exec"), scope)
    return scope[method.name]


def main():
    model = tf.keras.models.load_model(SOURCE / "sign_language_recognition.keras", compile=False)
    scaler = joblib.load(SOURCE / "scaler.pkl")
    labels = joblib.load(SOURCE / "label_encoder.pkl").classes_.tolist()
    order = json.loads((SOURCE / "feature_order.json").read_text())
    assert model.input_shape == (None, 5, 18) and model.output_shape == (None, 11)
    assert len(order) == len(scaler.mean_) == len(scaler.scale_) == 18
    assert len(labels) == 11 and np.all(scaler.scale_ > 0)
    expected = ["InputLayer", "LSTM", "Dropout", "BatchNormalization", "LSTM",
                "Dropout", "BatchNormalization", "Dense", "Dropout", "Dense"]
    assert [type(layer).__name__ for layer in model.layers] == expected
    nodes, weights = [], []
    counter = 0

    def const(value, dtype=np.float32):
        nonlocal counter
        counter += 1
        name = f"constant_{counter}"
        weights.append(numpy_helper.from_array(np.asarray(value, dtype=dtype), name))
        return name

    def op(kind, *inputs, **attrs):
        nonlocal counter
        counter += 1
        name = f"{kind}_{counter}"
        nodes.append(helper.make_node(kind, list(inputs), [name], **attrs))
        return name

    # Each time slice has shape [1, features]; batch size is deliberately fixed.
    sequence = [op("Gather", "input", const(t, np.int64), axis=1) for t in range(5)]
    for layer in model.layers[1:]:
        cfg = layer.get_config()
        kind = type(layer).__name__
        if kind == "Dropout":
            continue  # Keras training=False
        if kind == "LSTM":
            assert cfg["activation"] == "tanh" and cfg["recurrent_activation"] == "sigmoid"
            assert not cfg["go_backwards"] and not cfg["stateful"] and cfg["use_bias"]
            assert not cfg["return_state"] and not cfg["dropout"] and not cfg["recurrent_dropout"]
            kernel, recurrent, bias = map(const, layer.get_weights())
            units = cfg["units"]
            h = c = const(np.zeros((1, units)))
            result = []
            for x in sequence:
                gates = op("Add", op("Add", op("MatMul", x, kernel), op("MatMul", h, recurrent)), bias)
                parts = [op("Gather", gates, const(np.arange(i * units, (i + 1) * units), np.int64), axis=1)
                         for i in range(4)]
                i, f, g, o = [op(a, p) for a, p in zip(["Sigmoid", "Sigmoid", "Tanh", "Sigmoid"], parts)]
                c = op("Add", op("Mul", f, c), op("Mul", i, g))
                h = op("Mul", o, op("Tanh", c))
                result.append(h)
            sequence = result if cfg["return_sequences"] else result[-1:]
        elif kind == "BatchNormalization":
            assert cfg["axis"] == -1 and cfg["center"] and cfg["scale"]
            gamma, beta, mean, variance = layer.get_weights()
            gamma, beta, mean, denom = map(const, [gamma, beta, mean, np.sqrt(variance + cfg["epsilon"])])
            sequence = [op("Add", op("Mul", op("Div", op("Sub", x, mean), denom), gamma), beta)
                        for x in sequence]
        elif kind == "Dense":
            assert len(sequence) == 1 and cfg["use_bias"]
            kernel, bias = map(const, layer.get_weights())
            x = op("Add", op("MatMul", sequence[0], kernel), bias)
            assert cfg["activation"] in ("relu", "softmax")
            sequence = [op("Relu", x) if cfg["activation"] == "relu" else op("Softmax", x, axis=-1)]
        else:
            raise ValueError(f"Unsupported layer: {kind}")
    nodes.append(helper.make_node("Identity", sequence, ["probabilities"]))
    graph = helper.make_graph(nodes, "SignBridge_upstream", [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 5, 18])],
                              [helper.make_tensor_value_info("probabilities", TensorProto.FLOAT, [1, 11])], weights)
    exported = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)], ir_version=8,
                                 producer_name="SignBridge fixed architecture exporter")
    onnx.checker.check_model(exported, full_check=True)
    OUT.mkdir(parents=True, exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)
    onnx.save(exported, OUT / "signbridge.onnx")
    metadata = {"labels": labels, "featureOrder": order, "mean": scaler.mean_.tolist(),
                "scale": scaler.scale_.tolist(), "inputShape": [1, 5, 18], "windowSize": 7,
                "sequenceLength": 5, "targetFps": 15, "stdDdoF": 0,
                "handOrder": "detection order, not handedness", "mirrorInput": False,
                "sourceSha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(SOURCE.iterdir()) if p.is_file()}}
    (OUT / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    # Fixtures are synthetic and never imported by the application.
    standalone = source_features(ROOT / "real_time_inference.py")
    flask = source_features(ROOT / "app/utils/real_time_recognition.py")
    instance = SimpleNamespace(feature_order=order)
    rng = np.random.default_rng(20260930)
    cases = []
    for case in range(16):
        frames = []
        for t in range(35):
            frame = {}
            for key, count in [("pose", 6), ("hand_0", 5), ("hand_1", 5)]:
                missing = case == 0 or (case == 1 and key == "hand_1") or (case == 2 and t % 3 == 0)
                coords = rng.uniform([0.1, 0.1, -0.4], [0.9, 0.9, 0.1], size=(count, 3))
                frame[key] = [] if missing else [dict(zip("xyz", row.tolist())) for row in coords]
            frames.append(frame)
        raw = np.array([standalone(instance, frames[t:t+7]) for t in range(0, 35, 7)])
        other = np.array([flask(instance, frames[t:t+7]) for t in range(0, 35, 7)])
        np.testing.assert_array_equal(raw, other)
        normalized = scaler.transform(raw).astype(np.float32)
        prediction = model(normalized[None], training=False).numpy()[0]
        cases.append({"name": f"synthetic-landmarks-{case}", "frames": frames,
                      "features": raw.tolist(), "normalized": normalized.tolist(), "output": prediction.tolist()})
    # Broader numerical coverage independent of landmark distributions.
    for case in range(16):
        normalized = rng.normal(0, 0.25 + case / 4, (5, 18)).astype(np.float32)
        prediction = model(normalized[None], training=False).numpy()[0]
        cases.append({"name": f"synthetic-tensor-{case}", "normalized": normalized.tolist(), "output": prediction.tolist()})
    (FIXTURES / "parity.json").write_text(json.dumps({"synthetic": True, "featureAtol": 1e-10,
        "normalizedAtol": 2e-6, "outputAtol": 1e-5, "cases": cases}), encoding="utf-8")
    print(json.dumps({"input": model.input_shape, "labels": labels, "onnxBytes": (OUT / "signbridge.onnx").stat().st_size,
                      "fixtures": len(cases), "operators": sorted({n.op_type for n in nodes})}, indent=2))


if __name__ == "__main__":
    main()
