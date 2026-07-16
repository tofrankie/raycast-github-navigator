import { getPreferenceValues } from '@raycast/api';
import type { Repository } from './types';

export const sortRepos = (repositories: Repository[] = []) => {
  const repos = (repositories ?? []).filter(repo => repo.id);
  const { sortBy } = getPreferenceValues<Preferences.NavigateGithub>();

  if (sortBy === 'updated_at') {
    return repos.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  return repos.sort((a, b) => b[sortBy] - a[sortBy]);
};
