import FirebaseRecaptchaVerifierModal, { FirebaseRecaptchaVerifierModalRef } from '@/components/firebase-recaptcha-modal';
import app, { auth } from '@/config/firebase';
import { Ionicons } from '@expo/vector-icons';
import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { ConfirmationResult, signInWithPhoneNumber } from 'firebase/auth';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// Map ISO 3166-1 alpha-2 region codes to calling codes
const REGION_TO_CALLING_CODE: Record<string, string> = {
  AC: '+247', AD: '+376', AE: '+971', AF: '+93', AG: '+1268', AI: '+1264',
  AL: '+355', AM: '+374', AO: '+244', AR: '+54', AS: '+1684', AT: '+43',
  AU: '+61', AW: '+297', AZ: '+994', BA: '+387', BB: '+1246', BD: '+880',
  BE: '+32', BF: '+226', BG: '+359', BH: '+973', BI: '+257', BJ: '+229',
  BL: '+590', BM: '+1441', BN: '+673', BO: '+591', BR: '+55', BS: '+1242',
  BT: '+975', BW: '+267', BY: '+375', BZ: '+501', CA: '+1', CC: '+61',
  CD: '+243', CF: '+236', CG: '+242', CH: '+41', CI: '+225', CK: '+682',
  CL: '+56', CM: '+237', CN: '+86', CO: '+57', CR: '+506', CU: '+53',
  CV: '+238', CX: '+61', CY: '+357', CZ: '+420', DE: '+49', DJ: '+253',
  DK: '+45', DM: '+1767', DO: '+1849', DZ: '+213', EC: '+593', EE: '+372',
  EG: '+20', ER: '+291', ES: '+34', ET: '+251', FI: '+358', FJ: '+679',
  FK: '+500', FM: '+691', FO: '+298', FR: '+33', GA: '+241', GB: '+44',
  GD: '+1473', GE: '+995', GF: '+594', GH: '+233', GI: '+350', GL: '+299',
  GM: '+220', GN: '+224', GP: '+590', GQ: '+240', GR: '+30', GT: '+502',
  GU: '+1671', GW: '+245', GY: '+592', HK: '+852', HN: '+504', HR: '+385',
  HT: '+509', HU: '+36', ID: '+62', IE: '+353', IL: '+972', IN: '+91',
  IO: '+246', IQ: '+964', IR: '+98', IS: '+354', IT: '+39', JM: '+1876',
  JO: '+962', JP: '+81', KE: '+254', KG: '+996', KH: '+855', KI: '+686',
  KM: '+269', KN: '+1869', KP: '+850', KR: '+82', KW: '+965', KY: '+1345',
  KZ: '+7', LA: '+856', LB: '+961', LC: '+1758', LI: '+423', LK: '+94',
  LR: '+231', LS: '+266', LT: '+370', LU: '+352', LV: '+371', LY: '+218',
  MA: '+212', MC: '+377', MD: '+373', ME: '+382', MG: '+261', MH: '+692',
  MK: '+389', ML: '+223', MM: '+95', MN: '+976', MO: '+853', MP: '+1670',
  MQ: '+596', MR: '+222', MS: '+1664', MT: '+356', MU: '+230', MV: '+960',
  MW: '+265', MX: '+52', MY: '+60', MZ: '+258', NA: '+264', NC: '+687',
  NE: '+227', NF: '+672', NG: '+234', NI: '+505', NL: '+31', NO: '+47',
  NP: '+977', NR: '+674', NU: '+683', NZ: '+64', OM: '+968', PA: '+507',
  PE: '+51', PF: '+689', PG: '+675', PH: '+63', PK: '+92', PL: '+48',
  PM: '+508', PR: '+1787', PS: '+970', PT: '+351', PW: '+680', PY: '+595',
  QA: '+974', RE: '+262', RO: '+40', RS: '+381', RU: '+7', RW: '+250',
  SA: '+966', SB: '+677', SC: '+248', SD: '+249', SE: '+46', SG: '+65',
  SH: '+290', SI: '+386', SK: '+421', SL: '+232', SM: '+378', SN: '+221',
  SO: '+252', SR: '+597', SS: '+211', ST: '+239', SV: '+503', SX: '+1721',
  SY: '+963', SZ: '+268', TC: '+1649', TD: '+235', TG: '+228', TH: '+66',
  TJ: '+992', TK: '+690', TL: '+670', TM: '+993', TN: '+216', TO: '+676',
  TR: '+90', TT: '+1868', TV: '+688', TW: '+886', TZ: '+255', UA: '+380',
  UG: '+256', US: '+1', UY: '+598', UZ: '+998', VA: '+379', VC: '+1784',
  VE: '+58', VG: '+1284', VI: '+1340', VN: '+84', VU: '+678', WF: '+681',
  WS: '+685', YE: '+967', YT: '+262', ZA: '+27', ZM: '+260', ZW: '+263',
};

function getCallingCode(): string {
  try {
    const locales = getLocales();
    const region = locales[0]?.regionCode ?? 'US';
    return REGION_TO_CALLING_CODE[region] ?? '+1';
  } catch {
    return '+1';
  }
}

export default function PhoneAuthScreen() {
  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModalRef>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [callingCode] = useState(getCallingCode);
  const [localNumber, setLocalNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullNumber = `${callingCode}${localNumber.replace(/\s/g, '')}`;

  const sendOtp = async () => {
    if (!localNumber.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPhoneNumber(auth, fullNumber, recaptchaVerifier.current!);
      setConfirmationResult(result);
      setStep(2);
    } catch (err: any) {
      setError(err.message ?? 'Failed to send code.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim() || !confirmationResult) return;
    setLoading(true);
    setError(null);
    try {
      await confirmationResult.confirm(otp.trim());
    } catch (err: any) {
      setError(err.message ?? 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={app.options}
        attemptInvisibleVerification
      />

      <View style={styles.inner}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => (step === 2 ? setStep(1) : router.back())}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.logo}>PumpPal</Text>

        {step === 1 ? (
          <>
            <Text style={styles.heading}>Enter your phone number</Text>
            <Text style={styles.hint}>We detected your country code automatically.</Text>

            <View style={styles.phoneRow}>
              <View style={styles.callingCodeBox}>
                <Text style={styles.callingCodeText}>{callingCode}</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="555 000 1234"
                placeholderTextColor="#555"
                keyboardType="phone-pad"
                autoFocus
                value={localNumber}
                onChangeText={setLocalNumber}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={sendOtp}
              disabled={loading || !localNumber.trim()}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send Code</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Enter the 6-digit code</Text>
            <Text style={styles.hint}>Sent to {fullNumber}</Text>

            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="000000"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              value={otp}
              onChangeText={setOtp}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={verifyOtp}
              disabled={loading || otp.length < 6}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendLink}
              onPress={() => { setStep(1); setOtp(''); setError(null); }}>
              <Text style={styles.resendText}>Resend code</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
  },
  back: {
    marginBottom: 24,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#e54242',
    marginBottom: 32,
    letterSpacing: -1,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#888',
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  otpInput: {
    letterSpacing: 8,
    fontSize: 24,
    textAlign: 'center',
  },
  error: {
    color: '#f87171',
    fontSize: 14,
    marginBottom: 16,
    backgroundColor: '#2a1515',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#e54242',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  resendLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  resendText: {
    color: '#e54242',
    fontSize: 14,
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  callingCodeBox: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  callingCodeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },
});
