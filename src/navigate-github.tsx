import type { Repository } from './types';
import { Action, ActionPanel, closeMainWindow, Color, getPreferenceValues, Icon, List, open } from '@raycast/api';
import { useCachedPromise, useFrecencySorting } from '@raycast/utils';
import { openInBrowserTab } from 'browser-tab-bridge';
import { sortRepos } from './repos';

export default function Command() {
  const { personalAccessToken, sortBy, showStars, showIssuesPRs, reuseTab } =
    getPreferenceValues<Preferences.NavigateGithub>();

  const { data, isLoading } = useCachedPromise(fetchAllRepos, [personalAccessToken, sortBy], {
    keepPreviousData: true,
  });

  const { data: sortedData, visitItem } = useFrecencySorting<Repository>(sortRepos(data), { key: repo => repo.id });

  return (
    <List isLoading={isLoading && !data?.length} searchBarPlaceholder="Search repositories..." throttle>
      {sortedData.map(repo => {
        const accessories: List.Item.Accessory[] = [];
        const updatedAt = new Date(repo.updated_at);

        const infoList: string[] = [];

        if (showStars) {
          infoList.push(`Stars: ${repo.stargazers_count}`);
        }

        if (showIssuesPRs) {
          infoList.push(`Open issues: ${repo.open_issues_count}`);
          infoList.push(`Open pull requests: ${repo.open_prs_count}`);
        }

        // info
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

        if (repo.is_fork) {
          accessories.unshift({
            icon: Icon.Anchor,
            tooltip: `Forked from ${repo.parent_full_name ?? 'unknown upstream'}`,
          });
        }

        if (repo.is_private) {
          accessories.unshift({
            icon: Icon.Lock,
            tooltip: 'Private repository',
          });
        }

        // updated_at
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
                        key: String(index + 1),
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
}

function toRepo(node: Record<string, unknown>, viewerLogin: string): Repository {
  const ownerLogin = (node.owner as { login: string }).login;
  const parentFullName = (node.parent as { nameWithOwner?: string } | null)?.nameWithOwner;
  return {
    id: String(node.databaseId),
    name: node.name as string,
    full_name: node.nameWithOwner as string,
    description: (node.description as string) || '',
    html_url: node.url as string,
    updated_at: node.updatedAt as string,
    is_fork: node.isFork as boolean,
    parent_full_name: parentFullName ?? undefined,
    is_private: node.isPrivate as boolean,
    is_own_repo: Boolean(viewerLogin && ownerLogin === viewerLogin),
    stargazers_count: node.stargazerCount as number,
    open_issues_count: (node.issues as { totalCount: number }).totalCount,
    open_prs_count: (node.pullRequests as { totalCount: number }).totalCount,
  };
}

function getRepositoryOrderBy(sortBy: Preferences.NavigateGithub['sortBy']) {
  if (sortBy !== 'updated_at') return undefined;

  return { field: 'UPDATED_AT', direction: 'DESC' };
}

async function graphql(token: string, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(response.statusText);
  const json = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

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

const REPO_FIELDS = `
  databaseId
  name
  nameWithOwner
  description
  url
  updatedAt
  isFork
  isPrivate
  stargazerCount
  forkCount
  issues(states: OPEN) { totalCount }
  pullRequests(states: OPEN) { totalCount }
  owner { login }
  parent { nameWithOwner }
`;

const USER_REPOS_QUERY = `query($cursor: String, $orderBy: RepositoryOrder) {
  viewer {
    repositories(first: 100, after: $cursor, affiliations: [OWNER, COLLABORATOR], orderBy: $orderBy) {
      pageInfo { hasNextPage endCursor }
      nodes { ${REPO_FIELDS} }
    }
  }
}`;

const ORG_REPOS_QUERY = `query($org: String!, $cursor: String, $orderBy: RepositoryOrder) {
  organization(login: $org) {
    repositories(first: 100, after: $cursor, orderBy: $orderBy) {
      pageInfo { hasNextPage endCursor }
      nodes { ${REPO_FIELDS} }
    }
  }
}`;

const ORGS_QUERY = `query {
  viewer {
    login
    organizations(first: 100) {
      nodes { login }
    }
  }
}`;

async function fetchAllRepos(token: string, sortBy: Preferences.NavigateGithub['sortBy']): Promise<Repository[]> {
  const seen = new Set<string>();
  const allRepos: Repository[] = [];
  const orderBy = getRepositoryOrderBy(sortBy);

  const orgsData = await graphql(token, ORGS_QUERY);
  const viewerLogin: string = orgsData.viewer.login ?? '';
  const orgs: string[] = orgsData.viewer.organizations.nodes.map((n: { login: string }) => n.login);

  function addRepos(nodes: Record<string, unknown>[]) {
    for (const node of nodes) {
      const repo = toRepo(node, viewerLogin);
      if (!seen.has(repo.full_name)) {
        seen.add(repo.full_name);
        allRepos.push(repo);
      }
    }
  }

  // Fetch user's own + collaborator repos
  let cursor: string | null = null;
  while (true) {
    const data = await graphql(token, USER_REPOS_QUERY, { cursor, orderBy });
    const { nodes, pageInfo } = data.viewer.repositories;
    addRepos(nodes);
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }

  // All repos per org
  for (const org of orgs) {
    cursor = null;
    while (true) {
      const data = await graphql(token, ORG_REPOS_QUERY, { org, cursor, orderBy });
      const { nodes, pageInfo } = data.organization.repositories;
      addRepos(nodes);
      if (!pageInfo.hasNextPage) break;
      cursor = pageInfo.endCursor;
    }
  }

  return allRepos;
}
