import { PageHeader } from '../../components/ui';
import NutritionViewer from './NutritionViewer';

// Client: read-only view of their own nutrition plan.
export default function ClientNutrition({ clientMemberId }) {
  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="07" section="CLIENT · NUTRITION" title="Nutrition." subtitle="— fuel the standard." />
      <NutritionViewer memberId={clientMemberId} />
    </div>
  );
}
