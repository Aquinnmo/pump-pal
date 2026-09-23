def patch_firebase_crashlytics_status_bar(pods_root)
  path = File.join(pods_root, 'FirebaseCrashlytics/Crashlytics/Crashlytics/Controllers/FIRCLSNotificationManager.m')
  source = File.read(path)
  old_call = '[FIRCLSApplicationSharedInstance() statusBarOrientation]'
  new_call = 'FIRCLSSceneOrientation()'
  return if source.include?(new_call) && !source.include?(old_call)
  raise "Unexpected Firebase Crashlytics status bar source: #{path}" unless source.scan(old_call).length == 2

  helper = <<~OBJC
    static UIInterfaceOrientation FIRCLSSceneOrientation(void) {
      UIWindowScene *fallback = nil;
      for (UIScene *scene in FIRCLSApplicationSharedInstance().connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) continue;
        if (scene.activationState == UISceneActivationStateForegroundActive) {
          return ((UIWindowScene *)scene).interfaceOrientation;
        }
        fallback = (UIWindowScene *)scene;
      }
      return fallback ? fallback.interfaceOrientation : UIInterfaceOrientationUnknown;
    }

  OBJC
  anchor = '@implementation FIRCLSNotificationManager'
  raise "Unexpected Firebase Crashlytics implementation: #{path}" unless source.include?(anchor)
  source.sub!(anchor, helper + anchor)
  source.gsub!(old_call, new_call)
  File.chmod(File.stat(path).mode | 0200, path)
  File.write(path, source)
end
