<?php declare(strict_types=1);

namespace CustomMegaMenu\Subscriber;

use Shopware\Core\Content\Category\Event\NavigationLoadedEvent;
use Shopware\Core\Content\Category\Tree\TreeItem;
use Shopware\Core\Framework\DataAbstractionLayer\EntityRepository;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

class NavigationMediaSubscriber implements EventSubscriberInterface
{
    public function __construct(
        private readonly EntityRepository $categoryRepository,
    ) {}

    public static function getSubscribedEvents(): array
    {
        return [
            NavigationLoadedEvent::class => 'onNavigationLoaded',
        ];
    }

    public function onNavigationLoaded(NavigationLoadedEvent $event): void
    {
        $tree = $event->getNavigation()->getTree();

        if (empty($tree)) {
            return;
        }

        $missingMediaIds = [];
        foreach ($tree as $treeItem) {
            $category = $treeItem->getCategory();
            if ($category !== null && $category->getMedia() === null) {
                $missingMediaIds[] = $category->getId();
            }
        }

        if (empty($missingMediaIds)) {
            $this->injectMediaUrls($tree);
            return;
        }

        $criteria = new Criteria($missingMediaIds);
        $criteria->addAssociation('media');

        $enriched = $this->categoryRepository->search(
            $criteria,
            $event->getContext()
        );

        foreach ($tree as $treeItem) {
            $category = $treeItem->getCategory();
            if ($category === null) {
                continue;
            }
            $enrichedCategory = $enriched->get($category->getId());
            if ($enrichedCategory !== null && $enrichedCategory->getMedia() !== null) {
                $category->setMedia($enrichedCategory->getMedia());
            }
        }

        $this->injectMediaUrls($tree);
    }

    /**
     * @param TreeItem[] $tree
     */
    private function injectMediaUrls(array $tree): void
    {
        foreach ($tree as $treeItem) {
            $category = $treeItem->getCategory();
            if ($category === null) {
                continue;
            }

            $media = $category->getMedia();
            if ($media === null || $media->getUrl() === '') {
                continue;
            }

            $customFields = $category->getCustomFields() ?? [];
            $customFields['_mediaUrl'] = $media->getUrl();
            $category->setCustomFields($customFields);
        }
    }
}