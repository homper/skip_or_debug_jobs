import { getOctokit } from '@actions/github';
import { getInput, setOutput, setFailed } from '@actions/core';
import { Context } from '@actions/github/lib/context';

type Commit = { message: string; sha: string };

function getPrId (ref: string) {
  const prIdRegex = /(?<=refs\/pull\/)[\d\w]+(?=\/merge)/i;

  let prId = getInput('pr-id');

  if (!prId) {
    console.log(`Searching for pull request ID in ref: ${ref}`);
    [prId] = prIdRegex.exec(ref) ?? [];
  }

  if (!prId) {
    throw new Error("Pull request ID was not found, in action's ref.");
  } else if (Number.isNaN(Number(prId))) {
    throw new Error(`Invalid pull request ID: ${prId}`);
  } else if (prId.startsWith('0')) {
    throw new Error(`Invalid pull request ID: ${prId}`);
  }

  return Number(prId);
};

async function getCommits(octokit:ReturnType<typeof getOctokit>,
                          context: Context): Promise<Commit[]> {
  const { pulls, repos } = octokit;

  console.log(context);

  const {
    ref,
    repo: { owner, repo },
    eventName,
  } = context;
  console.log(ref, repo, eventName);

  if (eventName === 'push') {
    const {
      payload: { before }, // The SHA of the most recent commit on ref before the push.
    } = context;
    console.log(before);

    const { data } = await repos.listCommits({
      owner,
      repo,
    });

    const commits: typeof data = [];

    data.every((commit) => {
      if (commit.sha === before) {
        return false;
      }
      commits.push(commit);
      return true;
    });

    return commits.map(({ commit: { message, url }, sha }) => {
      console.log(`Found commit sha: ${sha} in push. ${url}`);
      return { message, sha };
    });
  }

  const prId = getPrId(ref);

  const { data: commits } = await pulls.listCommits({
    owner,
    pull_number: prId,
    repo,
  });

  return commits.map(({ commit: { message, url }, sha }) => {
    console.log(`Found commit sha: ${sha} in pull request: ${prId}. ${url}`);
    return { message, sha };
  });
}

function isMatch(phrase: string | RegExp, string: string): boolean {
  if (phrase instanceof RegExp) {
    /* RegExp copy prevents g flag from storing lastIndex between test */
    const regexCopy = new RegExp(phrase);
    return regexCopy.test(string);
  }

  const lowercaseString = string.replace(/\s+/g, ' ').trim().toLowerCase();

  return lowercaseString.includes(phrase);
};

function searchAllCommitMessages ( commits: Commit[],
                                   phrase: string | RegExp) {
  const commit = commits.find(({ message, sha }) => {
    console.log(`Searching for "${phrase}" in "${message}" sha: ${sha}`);

    return !isMatch(phrase, message);
  });

  const result = !commit;

  if (result) {
    return { result, commit: undefined };
  }

  return { result, commit: commit };
}

type SearchInCommitsResult = {
  result: boolean;
  commit?: Commit;
};

async function searchInCommits (octokit: ReturnType<typeof getOctokit>,
                                context: Context,
                                phrase: string): Promise<SearchInCommitsResult>
{
  const commits = await getCommits(octokit, context);

  console.log(commits);

  return searchAllCommitMessages(commits, phrase);
}

async function run() {
  try {
    const githubToken = getInput('github-token', {
      required: true,
    });
    const octokit = getOctokit(githubToken);
    const ctx = new Context();
    const messages = await searchInCommits(octokit, ctx, "[skip]");
    console.log(messages);
    const job_id = getInput('job_id');
    const job_matrix = getInput('job_matrix');
    console.log(`Hello ${job_id}!`);
    console.log(`With matrix:\n${job_matrix}!`);
    console.log(`run_${job_id} = 1`)
    console.log(`run_ban = 1`)
    setOutput(`run_${job_id}`, 1);
    setOutput('run_ban', 1);
  } catch (error) {
    setFailed(error.message);
  }
}

export default run;