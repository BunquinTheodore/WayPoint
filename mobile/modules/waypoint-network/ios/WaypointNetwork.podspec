Pod::Spec.new do |s|
  s.name = 'WaypointNetwork'
  s.version = '0.1.0'
  s.summary = 'Local-only building Wi-Fi and verified HTTPS package transfer'
  s.description = 'Waypoint local network module'
  s.license = { :type => 'MIT' }
  s.author = 'Waypoint'
  s.homepage = 'https://example.invalid/waypoint'
  s.platforms = { :ios => '16.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'NetworkExtension', 'Security'
end
