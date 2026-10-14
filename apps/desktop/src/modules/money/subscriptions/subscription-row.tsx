import { formatInr, type Subscription } from '@personal-os/shared';
import { Button } from '@personal-os/ui';
import { renewalText, shortDay } from '../money-format';
import { ColorDot } from '../ui/fields';
import { CYCLE_NAMES } from './cycle-names';

/** One subscription: price, cycle, when it renews, Overdue badge, Mark paid and Edit. */
export function SubscriptionRow({
  subscription: sub,
  detail = true,
  onPaid,
  onEdit,
  paying,
}: {
  subscription: Subscription;
  /** False in the upcoming list: no monthly/yearly figures. */
  detail?: boolean;
  onPaid: (subscription: Subscription) => void;
  onEdit?: (subscription: Subscription) => void;
  paying: boolean;
}) {
  const dim = sub.status !== 'active';
  return (
    <li className={`flex items-center gap-3 px-2 py-1.5 ${dim ? 'opacity-60' : ''}`}>
      <ColorDot color={sub.color} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 truncate text-body text-fg">
          {sub.name}
          {sub.overdue ? (
            <span className="rounded-chip bg-danger/20 px-1.5 text-small font-medium text-danger">
              Overdue
            </span>
          ) : null}
          {dim ? (
            <span className="rounded-chip bg-input px-1.5 text-small text-fg-secondary">
              {sub.status === 'paused' ? 'Paused' : 'Cancelled'}
            </span>
          ) : null}
        </span>
        <span className="truncate text-small text-fg-muted">
          {CYCLE_NAMES[sub.cycle]} · Renews {shortDay(sub.nextRenewalOn)}
          {sub.status === 'active' ? ` · ${renewalText(sub.daysUntilRenewal)}` : ''}
          {detail
            ? ` · ${formatInr(sub.monthlyPaise)}/month · ${formatInr(sub.yearlyPaise)}/year`
            : ''}
        </span>
      </span>
      <span className="text-body font-medium text-fg tabular-nums">
        {formatInr(sub.amountPaise)}
      </span>
      {sub.status === 'active' ? (
        <Button
          variant="secondary"
          aria-label={`Mark ${sub.name} paid`}
          disabled={paying}
          onClick={() => {
            onPaid(sub);
          }}
        >
          Mark paid
        </Button>
      ) : null}
      {onEdit ? (
        <Button
          variant="secondary"
          aria-label={`Edit ${sub.name}`}
          onClick={() => {
            onEdit(sub);
          }}
        >
          Edit
        </Button>
      ) : null}
    </li>
  );
}
