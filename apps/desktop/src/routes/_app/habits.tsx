import { createFileRoute } from '@tanstack/react-router';
import { HabitsPage } from '../../modules/habits/habits-page';

export const Route = createFileRoute('/_app/habits')({
  component: HabitsPage,
});
