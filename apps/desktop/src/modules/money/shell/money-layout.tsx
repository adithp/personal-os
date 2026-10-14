import { BudgetsPage } from '../budgets/budgets-page';
import { GoalsPage } from '../goals/goals-page';
import { useMoneyUi } from '../money-ui-store';
import { useRunRecurring } from '../money-queries';
import { OverviewPage } from '../overview/overview-page';
import { ReportsPage } from '../reports/reports-page';
import { SubscriptionsPage } from '../subscriptions/subscriptions-page';
import { TransactionsPage } from '../transactions/transactions-page';
import { useMoneyNav } from '../use-money-nav';
import { WalletsPage } from '../wallets/wallets-page';
import { MoneySidePanel } from './side-panel';
import { MoneyShortcutsHelp } from './shortcuts-help';

/**
 * The Money page: the slim inner side panel and the page of the `section` in the URL. Opening
 * it creates the transactions of repeat rules that are due.
 */
export function MoneyLayout() {
  const { section } = useMoneyNav();
  const helpOpen = useMoneyUi((state) => state.helpOpen);
  const setHelpOpen = useMoneyUi((state) => state.setHelpOpen);
  useRunRecurring();

  return (
    <div className="flex h-full min-h-0 gap-3 px-4 pt-4">
      <MoneySidePanel />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {section === 'overview' ? <OverviewPage /> : null}
        {section === 'transactions' ? <TransactionsPage /> : null}
        {section === 'wallets' ? <WalletsPage /> : null}
        {section === 'budgets' ? <BudgetsPage /> : null}
        {section === 'goals' ? <GoalsPage /> : null}
        {section === 'subscriptions' ? <SubscriptionsPage /> : null}
        {section === 'reports' ? <ReportsPage /> : null}
      </div>
      {helpOpen ? (
        <MoneyShortcutsHelp
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
