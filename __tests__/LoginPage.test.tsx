import { fireEvent, render, screen } from '@testing-library/react';
import LoginPage from '@/components/LoginPage';

const signInWithPhoneNumberMock = vi.fn();
const signInWithPopupMock = vi.fn();

vi.mock('firebase/auth', async () => {
  const actual = await vi.importActual<typeof import('firebase/auth')>('firebase/auth');
  return {
    ...actual,
    RecaptchaVerifier: vi.fn().mockImplementation(() => ({ render: vi.fn() })),
    signInWithPhoneNumber: signInWithPhoneNumberMock,
    signInWithPopup: signInWithPopupMock,
    GoogleAuthProvider: vi.fn()
  };
});

vi.mock('@/lib/firebase', () => ({
  auth: {}
}));

describe('LoginPage', () => {
  beforeEach(() => {
    signInWithPhoneNumberMock.mockReset();
    signInWithPopupMock.mockReset();
  });

  it('renders phone number and google sign-in options', () => {
    render(<LoginPage />);

    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('shows a message when submitting without a phone number', () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));

    expect(
      screen.getByText('Enter a phone number in international format (e.g. +15551234567).')
    ).toBeInTheDocument();
  });

  it('calls google sign in when clicking the google button', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(signInWithPopupMock).toHaveBeenCalled();
  });
});
