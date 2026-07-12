import { Button, Card, CardBody, CardHeader, Link } from '@heroui/react';

import type React from 'react';

const DesignSystemExample = (): React.ReactElement => {
  return (
    <div className="flex flex-col gap-4 bg-background p-6">
      <Card className="border border-divider">
        <CardHeader className="text-lg font-semibold text-foreground">
          Design System Preview
        </CardHeader>
        <CardBody className="flex flex-row items-center gap-3">
          <Button color="primary">Primary</Button>
          <Button color="secondary" variant="flat">
            Secondary
          </Button>
          <Button color="danger" variant="bordered">
            Danger
          </Button>
          <Link href="/login">Log in</Link>
        </CardBody>
      </Card>
      <div className="rounded-medium bg-content2 p-4 text-sm text-foreground-500">
        Plain elements use the same semantic classes (bg-content2,
        text-foreground-500, rounded-medium) so they stay correct across theme
        toggles without any custom CSS.
      </div>
    </div>
  );
};

export default DesignSystemExample;
