import { Button, Card, CardBody, CardHeader, Link } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { ROUTES } from 'shared/constants/routes';

import type { ReactElement } from 'react';

export const DesignSystemExample = (): ReactElement => {
  const { t } = useTranslation('home');

  return (
    <div className="flex flex-col gap-4 bg-background p-6">
      <Card className="border border-divider">
        <CardHeader className="text-lg font-semibold text-foreground">
          {t('preview.title')}
        </CardHeader>
        <CardBody className="flex flex-row items-center gap-3">
          <Button color="primary">{t('preview.actions.primary')}</Button>
          <Button color="secondary" variant="flat">
            {t('preview.actions.secondary')}
          </Button>
          <Button color="danger" variant="bordered">
            {t('preview.actions.danger')}
          </Button>
          <Link href={ROUTES.LOGIN}>{t('preview.actions.signIn')}</Link>
        </CardBody>
      </Card>
      <div className="rounded-medium bg-content2 p-4 text-sm text-foreground-500">
        {t('preview.description')}
      </div>
    </div>
  );
};
