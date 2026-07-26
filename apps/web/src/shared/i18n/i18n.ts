import i18next from 'i18next';

const resources = {
  en: {
    translation: {
      errors: {
        api: {
          network: 'Check your connection and try again.',
          unexpected: 'Something went wrong. Try again.',
        },
        auth: {
          emailAlreadyRegistered: 'This email is already registered.',
          invalidCredentials: 'The email or password is incorrect.',
          invalidInput: 'Correct the highlighted authentication fields.',
          registrationUnavailable: 'Sign-up did not complete. Try again.',
          sessionUnavailable:
            'Sign-in could not establish a session. Try again.',
          signOutUnavailable: 'Sign-out did not complete. Try again.',
        },
      },
      success: {
        auth: {
          signOut: 'You have signed out.',
          signUp: 'Your account was created.',
        },
      },
      validation: {
        email: {
          invalid: 'Enter a supported email address.',
          required: 'Enter your email address.',
        },
        password: {
          length: 'Use between 8 and 128 characters.',
          required: 'Enter your password.',
        },
      },
    },
  },
} as const;

void i18next.init({
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  lng: 'en',
  resources,
});

export default i18next;
