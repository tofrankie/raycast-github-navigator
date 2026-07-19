import type { Repository } from './types';
import {
  Action,
  ActionPanel,
  closeMainWindow,
  Color,
  getPreferenceValues,
  Icon,
  Keyboard,
  List,
  open,
} from '@raycast/api';
import { useCachedPromise, useFrecencySorting } from '@raycast/utils';
import { openInBrowserTab } from 'browser-tab-bridge';
import { fetchAllRepos } from './graph';
import { sortRepos } from './repos';

export default function Command() {
  const { personalAccessToken, sort, reuseTab } = getPreferenceValues<Preferences.NavigateGithub>();

  const { data, isLoading } = useCachedPromise(fetchAllRepos, [personalAccessToken, sort], {
    keepPreviousData: true,
  });

  const { data: sortedData, visitItem } = useFrecencySorting<Repository>(sortRepos(data), { key: repo => repo.id });

  return (
    <List isLoading={isLoading && !data?.length} searchBarPlaceholder="Search repositories..." throttle>
      {sortedData.map(repo => {
        const accessories: List.Item.Accessory[] = [];

        // info
        const infoList = [
          `Stars: ${repo.stargazers_count}`,
          `Open issues: ${repo.open_issues_count}`,
          `Open pull requests: ${repo.open_prs_count}`,
        ];
        accessories.unshift({
          icon: Icon.Info,
          tooltip: infoList.join('\n'),
        });

        // organization
        if (!repo.is_own_repo) {
          accessories.unshift({
            icon: Icon.Building,
            tooltip: `Organization: ${repo.full_name.split('/')[0]}`,
          });
        }

        // fork
        if (repo.is_fork) {
          accessories.unshift({
            icon: Icon.Anchor,
            tooltip: `Forked from ${repo.parent_full_name ?? 'unknown upstream'}`,
          });
        }

        // private
        if (repo.is_private) {
          accessories.unshift({
            icon: Icon.Lock,
            tooltip: 'Private repository',
          });
        }

        // updated_at
        const updatedAt = new Date(repo.updated_at);
        accessories.unshift({
          date: updatedAt,
          tooltip: `Updated at ${updatedAt.toLocaleString()}`,
        });

        return (
          <List.Item
            key={repo.full_name}
            icon={{ source: Icon.Receipt, tintColor: Color.SecondaryText }}
            title={repo.name}
            subtitle={repo.description}
            keywords={[repo.name, repo.full_name]}
            accessories={accessories}
            actions={
              <ActionPanel>
                {getActions(repo).map((action, index) => {
                  return (
                    <Action
                      key={action.title}
                      title={action.title}
                      icon={action.icon}
                      shortcut={{
                        modifiers: ['cmd'],
                        key: String(index + 1) as Keyboard.KeyEquivalent,
                      }}
                      onAction={async () => {
                        await (reuseTab ? openInBrowserTab(action.url) : open(action.url));
                        visitItem(repo);
                        closeMainWindow();
                      }}
                    />
                  );
                })}
                <Action.CopyToClipboard
                  title="Copy Repo URL"
                  content={repo.html_url}
                  icon={Icon.Link}
                  shortcut={{ modifiers: ['cmd', 'shift'], key: '.' }}
                />
                <Action.CopyToClipboard
                  title="Copy SSH URL"
                  content={getSshUrl(repo)}
                  icon={Icon.Terminal}
                  shortcut={{ modifiers: ['cmd', 'shift'], key: ',' }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
  function getSshUrl(repo: Repository) {
    return `git@github.com:${repo.full_name}.git`;
  }

  function getActions(repo: Repository) {
    const base = repo.html_url;
    return [
      { title: 'Open Repository', url: base, icon: Icon.Globe },
      ...(repo.is_fork && repo.parent_full_name
        ? [{ title: 'Open Upstream Repository', url: `https://github.com/${repo.parent_full_name}`, icon: Icon.Globe }]
        : []),
      { title: 'Issues', url: `${base}/issues`, icon: Icon.Bug },
      { title: 'Pull requests', url: `${base}/pulls`, icon: Icon.ArrowNe },
      { title: 'Actions', url: `${base}/actions`, icon: Icon.Bolt },
      { title: 'Releases', url: `${base}/releases`, icon: Icon.Tag },
      { title: 'Insights', url: `${base}/pulse`, icon: Icon.LineChart },
      { title: 'Settings', url: `${base}/settings`, icon: Icon.Gear },
      { title: 'Dependents', url: `${base}/network/dependents`, icon: Icon.Network },
    ];
  }
}
