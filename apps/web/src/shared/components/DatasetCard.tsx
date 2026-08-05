import { Card, CardBody, CardHeader, Skeleton } from '@heroui/react';

import type { ReactElement, ReactNode } from 'react';

type DatasetCardProps = {
  children: ReactNode;
  empty: boolean;
  emptyLabel: string;
  error: boolean;
  errorLabel: string;
  loading: boolean;
  loadingLabel: string;
  title: string;
};

const DatasetMessage = ({
  error,
  label,
}: {
  error: boolean;
  label: string;
}): ReactElement => (
  <p role={error ? 'alert' : 'status'} className="py-6 text-foreground-500">
    {label}
  </p>
);

const DatasetSkeleton = ({ label }: { label: string }): ReactElement => (
  <div aria-label={label} className="space-y-3">
    <Skeleton className="h-16 rounded-medium" />
    <Skeleton className="h-16 rounded-medium" />
  </div>
);

export const DatasetCard = ({
  children,
  empty,
  emptyLabel,
  error,
  errorLabel,
  loading,
  loadingLabel,
  title,
}: DatasetCardProps): ReactElement => {
  let content = children;
  if (loading) {
    content = <DatasetSkeleton label={loadingLabel} />;
  } else if (error) {
    content = <DatasetMessage error label={errorLabel} />;
  } else if (empty) {
    content = <DatasetMessage error={false} label={emptyLabel} />;
  }

  return (
    <Card className="border border-divider shadow-none">
      <CardHeader className="text-lg font-semibold">{title}</CardHeader>
      <CardBody>{content}</CardBody>
    </Card>
  );
};
