import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/page';

jest.mock('firebase/auth', () => ({
  RecaptchaVerifier: jest.fn().mockImplementation(() => ({
    clear: jest.fn()
  })),
  signInWithPhoneNumber: jest.fn(),
  signInWithPopup: jest.fn()
}));

jest.mock('@/lib/firebase', () => ({
  auth: {},
  googleProvider: {}
}));

describe('LoginPage', () => {
  it('renders phone and google sign-in options', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });
});
