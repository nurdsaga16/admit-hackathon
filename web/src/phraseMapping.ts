// Assigned messages for existing class IDs; these are not linguistic translations.
export const phraseMapping: Readonly<Record<string, string>> = Object.freeze({
  person: 'Hello',
  afternoon: 'How are you?',
  age: "I'm fine",
  boy: "What's your name?",
  country: 'Nice to meet you',
  day: 'Thank you',
  monday: "You're welcome",
  name: 'Please repeat',
  night: 'Goodbye',
  people: 'I need help',
  time: 'One moment, please',
});

export function getPhrase(classId: string): string {
  return Object.hasOwn(phraseMapping, classId) ? phraseMapping[classId] : classId;
}

export const phraseExplanation = '11 заданных движений для общения готовыми фразами. Это условные жесты, а не перевод жестового языка';
