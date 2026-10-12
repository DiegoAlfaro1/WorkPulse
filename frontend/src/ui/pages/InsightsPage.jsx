import { useInsights } from '../../application/useInsights.js';
import { Kicker } from '../atoms';
import { BarList, Panel, SegmentedControl, StatBlock } from '../molecules';
import { Heatmap, InsightsFilters, TeamTable, TrendChart } from '../organisms';
import { PageShell } from '../templates/PageShell.jsx';

const SCOPES = [['me', 'Me'], ['team', 'Team']];
const RANGES = [['week', 'This week'], ['month', 'This month'], ['90', 'Last 90 days']];

export function InsightsPage({ all, role, now }) {
  const ins = useInsights({ all, role, now });
  const { report: R, people, wd, target } = ins;
  return (
    <PageShell className="ins">
      <div className="ins-head">
        <div><Kicker>Insights</Kicker><h1>{ins.scopeName}</h1></div>
        <div className="ins-ctrls">
          {role === 'manager' && <SegmentedControl name="scope" value={ins.scope} onChange={ins.setScope} options={SCOPES} />}
          <SegmentedControl name="range" value={ins.range} onChange={ins.setRange} options={RANGES} />
        </div>
      </div>

      <InsightsFilters {...ins} />

      <div className="stats">
        <StatBlock label="Tracked" value={R.tot.toFixed(1)} unit="h" note={`${wd} working days so far · target ${wd * 8 * people}h`} />
        <StatBlock label="Billable" value={R.tot ? Math.round(R.billH / R.tot * 100) : 0} unit="%"
          note={`${R.billH.toFixed(1)}h billable · ${(R.tot - R.billH).toFixed(1)}h non-billable`} />
        <StatBlock label="Average per day" value={R.days ? (R.tot / R.days).toFixed(1) : '0.0'} unit="h"
          note={people > 1 ? 'Per person, per day worked' : `Across ${R.days} days worked`} />
      </div>

      <div className="ins-row two">
        <Panel title="Hours by project" hint="Click to filter">
          <BarList rows={R.pRows} total={R.tot} active={ins.project} onPick={k => ins.setProject(ins.project === k ? 'all' : k)} />
        </Panel>
        <Panel title="Hours by task">
          <BarList rows={R.tRows} total={R.tot} color="var(--color-neutral-800)" />
        </Panel>
      </div>

      <div className="ins-row two">
        <Panel title={`${R.weekly ? 'Weekly' : 'Daily'} trend`} hint={`Stacked by project · dashed line = ${target}h target`}>
          <TrendChart buckets={R.buckets} target={target} />
        </Panel>
        <Panel title="Activity, last 26 weeks">
          <Heatmap data={R.heat} people={people} now={now} />
        </Panel>
      </div>

      {ins.scope === 'team' && (
        <Panel className="team" title="Team" hint="Click a person to focus">
          <TeamTable rows={R.team} workingDays={wd} active={ins.member} onPick={id => ins.setMember(ins.member === id ? 'all' : id)} />
        </Panel>
      )}
    </PageShell>
  );
}
