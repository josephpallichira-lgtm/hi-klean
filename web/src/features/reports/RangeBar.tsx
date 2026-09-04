import { grabFile } from '@shared/api/client';
import { useToast } from '@shared/ui/Toast';
import { Card, Field } from '@shared/ui/primitives';
import { useReportRange } from './rangeStore';

export function RangeBar({ idPrefix, csvPath }: { idPrefix: string; csvPath: (from: string, to: string) => string }) {
  const { range, setRange, presets } = useReportRange();
  const toast = useToast();
  return (
    <Card pad>
      <div className="row">
        <Field label="From">
          <input type="date" id={idPrefix + 'f'} value={range.from} onChange={(e) => setRange(e.target.value, range.to)} />
        </Field>
        <Field label="To">
          <input type="date" id={idPrefix + 't'} value={range.to} onChange={(e) => setRange(range.from, e.target.value)} />
        </Field>
        <button className="btn" data-q="today" onClick={presets.today}>Today</button>
        <button className="btn" data-q="week" onClick={presets.week}>This week</button>
        <button className="btn" data-q="month" onClick={presets.month}>This month</button>
        <button className="btn" data-q="fy" onClick={presets.fy}>This FY</button>
        <button className="btn" id={idPrefix + 'csv'}
          onClick={() => grabFile(csvPath(range.from, range.to), toast)}>Export CSV</button>
      </div>
    </Card>
  );
}
