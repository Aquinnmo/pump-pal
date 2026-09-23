require 'fileutils'
require 'tmpdir'
require_relative 'patch-firebase-crashlytics-status-bar'

Dir.mktmpdir do |root|
  path = File.join(root, 'FirebaseCrashlytics/Crashlytics/Crashlytics/Controllers/FIRCLSNotificationManager.m')
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, <<~OBJC)
    @implementation FIRCLSNotificationManager
    [FIRCLSApplicationSharedInstance() statusBarOrientation];
    [FIRCLSApplicationSharedInstance() statusBarOrientation];
    @end
  OBJC
  File.chmod(0444, path)

  patch_firebase_crashlytics_status_bar(root)
  patched = File.read(path)
  raise 'deprecated calls remain' if patched.include?('statusBarOrientation')
  raise 'scene calls missing' unless patched.scan('FIRCLSSceneOrientation()').length == 2
  patch_firebase_crashlytics_status_bar(root)
  raise 'patch is not idempotent' unless File.read(path) == patched
end

puts 'Crashlytics status bar patch passed'
