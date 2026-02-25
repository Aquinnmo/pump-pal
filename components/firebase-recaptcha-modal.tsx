/**
 * Drop-in replacement for FirebaseRecaptchaVerifierModal from the deprecated
 * expo-firebase-recaptcha package. Uses react-native-webview to render
 * Firebase's reCAPTCHA inside a Modal, implementing the ApplicationVerifier
 * interface expected by firebase/auth's signInWithPhoneNumber.
 */
import type { ApplicationVerifier } from 'firebase/auth';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

export interface FirebaseRecaptchaVerifierModalRef extends ApplicationVerifier {
  type: 'recaptcha';
  verify: () => Promise<string>;
}

interface Props {
  firebaseConfig: Record<string, unknown>;
  attemptInvisibleVerification?: boolean;
}

function buildHtml(config: Record<string, unknown>, size: 'invisible' | 'normal'): string {
  const configJson = JSON.stringify(config);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.0.0/firebase-auth-compat.js"></script>
  <style>
    body { margin:0; padding:20px; background:#0f0f0f;
           display:flex; justify-content:center; align-items:center; min-height:80px; }
  </style>
</head>
<body>
  <div id="rc"></div>
  <script>
    (function() {
      try {
        firebase.initializeApp(${configJson});
        var v = new firebase.auth.RecaptchaVerifier('rc', {
          size: '${size}',
          callback: function(token) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: 'token', token: token })
            );
          },
          'expired-callback': function() {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: 'expired' })
            );
          }
        });
        v.verify().catch(function(err) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'error', message: err.message || 'Recaptcha failed' })
          );
        });
      } catch(err) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'error', message: err.message || 'Init failed' })
        );
      }
    })();
  </script>
</body>
</html>`;
}

const FirebaseRecaptchaVerifierModal = forwardRef<
  FirebaseRecaptchaVerifierModalRef,
  Props
>(({ firebaseConfig, attemptInvisibleVerification = false }, ref) => {
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((token: string) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    type: 'recaptcha' as const,
    verify: () => {
      return new Promise<string>((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;
        setVisible(true);
      });
    },
  }));

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        token?: string;
        message?: string;
      };
      if (data.type === 'token' && data.token) {
        setVisible(false);
        resolveRef.current?.(data.token);
      } else if (data.type === 'expired' || data.type === 'error') {
        setVisible(false);
        rejectRef.current?.(
          new Error(data.message ?? 'reCAPTCHA expired or failed')
        );
      }
    } catch {
      // ignore parse errors
    }
  };

  const handleCancel = () => {
    setVisible(false);
    rejectRef.current?.(new Error('reCAPTCHA cancelled'));
  };

  const size: 'invisible' | 'normal' = attemptInvisibleVerification
    ? 'invisible'
    : 'normal';
  const html = buildHtml(firebaseConfig, size);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerText}>Verify you&apos;re human</Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ html }}
            onMessage={handleMessage}
            style={styles.webview}
            javaScriptEnabled
            originWhitelist={['*']}
          />
        </View>
      </View>
    </Modal>
  );
});

FirebaseRecaptchaVerifierModal.displayName = 'FirebaseRecaptchaVerifierModal';

export default FirebaseRecaptchaVerifierModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    width: 340,
    height: 220,
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2e2e2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  headerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: '#888',
    fontSize: 16,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
});
