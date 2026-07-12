import { createRoute } from '@tanstack/react-router';

import LoginForm from 'components/LoginForm';
import { rootRoute } from 'routes/index.route';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginForm,
});
