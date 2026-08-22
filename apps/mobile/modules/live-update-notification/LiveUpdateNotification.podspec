Pod::Spec.new do |s|
  s.name           = 'LiveUpdateNotification'
  s.version        = '1.0.0'
  s.summary        = 'Timber iOS Live Activity bridge'
  s.description    = 'Expo module bridge for Timber workout Live Activities.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'Timber' => 'support@timber.app' }
  s.homepage       = 'https://github.com/Aquinnmo/pump-pal'
  # This is an app-local development pod; CocoaPods must use the checked-out
  # module directory rather than attempting to fetch a remote source archive.
  s.source         = { :path => '.' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
