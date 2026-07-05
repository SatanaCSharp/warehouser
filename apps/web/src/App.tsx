import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router.js";

export default function App(): React.ReactElement {
  return <RouterProvider router={router} />;
}
