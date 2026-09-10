import { Button, Card, Link } from '@heroui/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ROUTES } from 'shared/constants/routes';

export const DesignSystemExample = (): ReactElement => {
  const { t } = useTranslation('home');

  return (
    <div className="flex flex-col gap-4 bg-background p-6">
      <Card className="border border-border">
        <Card.Header>
          <Card.Title className="text-lg font-semibold text-foreground">
            {t('preview.title')}
          </Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-row items-center gap-3">
          <Button variant="primary">{t('preview.actions.primary')}</Button>
          <Button variant="secondary">{t('preview.actions.secondary')}</Button>
          <Button variant="danger">{t('preview.actions.danger')}</Button>
          <Link href={ROUTES.LOGIN}>{t('preview.actions.signIn')}</Link>
        </Card.Content>
      </Card>
      <div className="rounded-lg bg-surface-secondary p-4 text-sm text-muted">
        {t('preview.description')}
      </div>
    </div>
  );
};
