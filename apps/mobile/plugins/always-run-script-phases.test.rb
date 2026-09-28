require_relative 'always-run-script-phases'

Phase = Struct.new(:name, :always_out_of_date)
Target = Struct.new(:shell_script_build_phases)
Project = Struct.new(:targets, :saves) do
  def save
    self.saves += 1
  end
end

named = ALWAYS_RUN_SCRIPT_PHASES.map { |name| Phase.new(name, nil) }
unrelated = Phase.new('[CP] Embed Pods Frameworks', nil)
changed = Project.new([Target.new(named + [unrelated])], 0)
done = Project.new([Target.new([Phase.new(ALWAYS_RUN_SCRIPT_PHASES.first, '1')])], 0)

always_run_script_phases([changed, done])
raise 'named phases not flagged' unless named.all? { |phase| phase.always_out_of_date == '1' }
raise 'unrelated phase was touched' unless unrelated.always_out_of_date.nil?
raise 'changed project was not saved once' unless changed.saves == 1
raise 'unchanged project was saved' unless done.saves == 0

always_run_script_phases([changed])
raise 'second run saved again' unless changed.saves == 1

puts 'Always-run script phases passed'
