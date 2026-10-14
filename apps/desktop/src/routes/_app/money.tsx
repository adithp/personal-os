import { createFileRoute } from '@tanstack/react-router';
import { validateMoneySearch } from '../../modules/money/money-search';
import { MoneyLayout } from '../../modules/money/shell/money-layout';

// The Money page: side panel and the page of the `section` search param (month and wallet too).
export const Route = createFileRoute('/_app/money')({
  validateSearch: validateMoneySearch,
  component: MoneyLayout,
});
