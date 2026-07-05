import { RouterProvider } from '@tanstack/react-router';
import React from 'react';

import { router } from 'router';

const App = (): React.ReactElement => <RouterProvider router={router} />;

export default App;
