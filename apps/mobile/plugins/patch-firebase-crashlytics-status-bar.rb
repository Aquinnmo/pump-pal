def patch_firebase_crashlytics_status_bar(pods_root)
  path = File.join(pods_root, 'FirebaseCrashlytics/Crashlytics/Crashlytics/Controllers/FIRCLSNotificationManager.m')
  source = File.read(path)
  old_call = '[FIRCLSApplicationSharedInstance() statusBarOrientation]'
  new_call = 'FIRCLSSceneOrientation()'
  old_scene_call = 'FIRCLSApplicationSharedInstance().connectedScenes'
  scene_call = '((UIApplication *)FIRCLSApplicationSharedInstance()).connectedScenes'
  if source.include?(new_call) && !source.include?(old_call)
    return unless source.include?(old_scene_call)
    source.sub!(old_scene_call, scene_call)
  else
    raise "Unexpected Firebase Crashlytics status bar source: #{path}" unless source.scan(old_call).length == 2

    helper = <<~OBJC
      static UIInterfaceOrientation FIRCLSSceneOrientation(void) {
        UIWindowScene *fallback = nil;
        for (UIScene *scene in #{scene_call}) {
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
  end
  File.chmod(File.stat(path).mode | 0200, path)
  File.write(path, source)
end
