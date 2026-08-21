import { Card } from '@heroui/react';

import type { ReactElement, ReactNode } from 'react';

type DatasetCardProps = {
  children: ReactNode;
  empty: boolean;
  emptyLabel: string;
  error: boolean;
  errorLabel: string;
  title: string;
};

const DatasetMessage = ({
  error,
  label,
}: {
  error: boolean;
  label: string;
}): ReactElement => (
  <p role={error ? 'alert' : 'status'} className="py-6 text-muted">
    {label}
  </p>
);

export const DatasetCard = ({
  children,
  empty,
  emptyLabel,
  error,
  errorLabel,
  title,
}: DatasetCardProps): ReactElement => {
  let content = children;
  if (error) {
    content = <DatasetMessage error label={errorLabel} />;
  } else if (empty) {
    content = <DatasetMessage error={false} label={emptyLabel} />;
  }

  return (
    <Card className="border border-border shadow-none">
      <Card.Header>
        <Card.Title className="text-lg font-semibold">{title}</Card.Title>
      </Card.Header>
      <Card.Content>{content}</Card.Content>
    </Card>
  );
};
