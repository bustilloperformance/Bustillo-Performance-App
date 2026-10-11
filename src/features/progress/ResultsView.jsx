import { useMemo, useState } from 'react';
import { useData } from '../../data/store';
import { PageHeader, Field } from '../../components/ui';
import SearchSelect from '../../components/SearchSelect';
import ProgressDashboard from './ProgressDashboard';

// Owner/coach: pick a member, view + edit their progress.
export default function ResultsView() {
  const { data } = useData();
  const [memberId, setMemberId] = useState(data.members[0]?.id || '');
  const memberOptions = useMemo(
    () => [...data.members].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ id: m.id, label: m.name })),
    [data.members],
  );

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="10" section="ANALYTICS · PROGRESS" title="Results." subtitle="— the work tells the truth." />
      <div className="mb-6 max-w-md">
        <Field label="VIEWING RESULTS FOR">
          <SearchSelect value={memberId} onChange={setMemberId} options={memberOptions} placeholder="Search athlete by name…" emptyText="No athlete found" />
        </Field>
      </div>
      {memberId && <ProgressDashboard memberId={memberId} editable />}
    </div>
  );
}
