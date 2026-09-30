# Script phases with no declared outputs make Xcode warn "Script has ambiguous
# dependencies" (they already run every build). Flag them always-out-of-date.
ALWAYS_RUN_SCRIPT_PHASES = [
  '[Expo Dev Launcher] Strip Local Network Keys for Release',
  '[CP-User] [RNFB] Core Configuration',
  '[CP-User] [RNFB] Crashlytics Configuration'
].freeze

def always_run_script_phases(projects)
  projects.each do |project|
    changed = false
    project.targets.each do |target|
      target.shell_script_build_phases.each do |phase|
        next unless ALWAYS_RUN_SCRIPT_PHASES.include?(phase.name) && phase.always_out_of_date != '1'

        phase.always_out_of_date = '1'
        changed = true
      end
    end
    project.save if changed
  end
end
