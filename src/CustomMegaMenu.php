<?php declare(strict_types=1);

namespace CustomMegaMenu;

use Doctrine\DBAL\Connection;
use Shopware\Core\Framework\Context;
use Shopware\Core\Framework\DataAbstractionLayer\EntityRepository;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Filter\EqualsFilter;
use Shopware\Core\Framework\Plugin;
use Shopware\Core\Framework\Plugin\Context\ActivateContext;
use Shopware\Core\Framework\Plugin\Context\DeactivateContext;
use Shopware\Core\Framework\Plugin\Context\UninstallContext;
use Shopware\Core\System\CustomField\CustomFieldTypes;

class CustomMegaMenu extends Plugin
{
    public function activate(ActivateContext $activateContext): void
    {
        parent::activate($activateContext);
        $this->createCustomFields($activateContext->getContext());
    }

    public function deactivate(DeactivateContext $deactivateContext): void
    {
        parent::deactivate($deactivateContext);
    }

    public function uninstall(UninstallContext $uninstallContext): void
    {
        parent::uninstall($uninstallContext);

        if ($uninstallContext->keepUserData()) {
            return;
        }

        $this->removeCustomFields($uninstallContext->getContext());
    }

    private function createCustomFields(Context $context): void
    {
        /** @var EntityRepository $customFieldSetRepository */
        $customFieldSetRepository = $this->container->get('custom_field_set.repository');

        $criteria = new Criteria();
        $criteria->addFilter(new EqualsFilter('name', 'mega_menu_set'));

        $existing = $customFieldSetRepository->search($criteria, $context);

        if ($existing->getTotal() > 0) {
            return;
        }

        $customFieldSetRepository->create([
            [
                'name'   => 'mega_menu_set',
                'config' => [
                    'label' => [
                        'en-GB' => 'Mega Menu Settings',
                        'de-DE' => 'Mega-Menü Einstellungen',
                    ],
                ],
                'customFields' => [
                    [
                        'name'   => 'show_in_mega_menu',
                        'type'   => CustomFieldTypes::BOOL,
                        'config' => [
                            'label' => [
                                'en-GB' => 'Show in Mega Menu',
                                'de-DE' => 'Im Mega-Menü anzeigen',
                            ],
                            'helpText' => [
                                'en-GB' => 'Enable this to show the category as a top-level item in the mega menu.',
                                'de-DE' => 'Aktivieren Sie dies, um die Kategorie als oberste Ebene im Mega-Menü anzuzeigen.',
                            ],
                            'customFieldType' => 'checkbox',
                            'customFieldPosition' => 1,
                        ],
                    ],
                ],
                'relations' => [
                    [
                        'entityName' => 'category',
                    ],
                ],
            ],
        ], $context);
    }

    private function removeCustomFields(Context $context): void
    {
        /** @var EntityRepository $customFieldSetRepository */
        $customFieldSetRepository = $this->container->get('custom_field_set.repository');

        $criteria = new Criteria();
        $criteria->addFilter(new EqualsFilter('name', 'mega_menu_set'));

        $result = $customFieldSetRepository->search($criteria, $context);

        if ($result->getTotal() === 0) {
            return;
        }

        $ids = array_map(static fn($entity) => ['id' => $entity->getId()], $result->getElements());
        $customFieldSetRepository->delete($ids, $context);
    }
}