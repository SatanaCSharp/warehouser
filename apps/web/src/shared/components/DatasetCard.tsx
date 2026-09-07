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

type DatasetCardState = 'failed' | 'empty' | 'ready';

type DatasetCardReading = Pick<DatasetCardProps, 'empty' | 'error'>;

/**
 * The states that displace the dataset, most significant first: a failed read
 * is stated before anything else, so an empty card is never read as a complete
 * answer to a request that did not arrive (CR-RG-05).
 */
const displacingStates: readonly {
  state: DatasetCardState;
  holds: (reading: DatasetCardReading) => boolean;
}[] = [
  { state: 'failed', holds: ({ error }) => error },
  { state: 'empty', holds: ({ empty }) => empty },
];

const resolveCardState = (reading: DatasetCardReading): DatasetCardState =>
  displacingStates.find(({ holds }) => holds(reading))?.state ?? 'ready';

export const DatasetCard = ({
  children,
  empty,
  emptyLabel,
  error,
  errorLabel,
  title,
}: DatasetCardProps): ReactElement => {
  const cardState = resolveCardState({ empty, error });

  const content: Record<DatasetCardState, ReactElement> = {
    failed: <DatasetMessage error label={errorLabel} />,
    empty: <DatasetMessage error={false} label={emptyLabel} />,
    ready: <>{children}</>,
  };

  return (
    <Card className="border border-border shadow-none">
      <Card.Header>
        <Card.Title className="text-lg font-semibold">{title}</Card.Title>
      </Card.Header>
      <Card.Content>{content[cardState]}</Card.Content>
    </Card>
  );
};
