import { PageHeader } from '../../components/ui';
import ProgressDashboard from '../progress/ProgressDashboard';

// Client: their own progress, editable (own goals + body comp).
export default function ClientResults({ clientMemberId }) {
  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="04" section="CLIENT · PROGRESS" title="Track Progress." subtitle="— the work tells the truth." />
      <ProgressDashboard memberId={clientMemberId} editable />
    </div>
  );
}
