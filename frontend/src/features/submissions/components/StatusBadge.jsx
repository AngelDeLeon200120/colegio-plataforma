import { Badge } from '@/components/ui/Badge';
import { STATUS_META } from '../constants';

export function StatusBadge({ status, className }) {
  const { label, tone } = STATUS_META[status];
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}
