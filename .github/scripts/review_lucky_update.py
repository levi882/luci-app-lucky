"""Approve only a bot-authored Lucky version bump with verified build evidence.

PR contents are read as data through the API; no code from the PR is executed.
GH_TOKEN performs reads. LUCKY_REVIEW_TOKEN is used only to submit the review.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys


MAKEFILE = 'lucky/Makefile'
FIELDS = ('PKG_VERSION', 'LUCKY_RELEASE_DIR', 'LUCKY_FILE_VERSION')
BUILD_WORKFLOW = '.github/workflows/build-openwrt-apk.yml'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def api(path, payload=None, token=None):
    command = ['gh', 'api', path]
    if payload is not None:
        command += ['--method', 'POST', '--input', '-']
    env = os.environ.copy()
    if token:
        env['GH_TOKEN'] = token
    result = subprocess.run(command, input=json.dumps(payload) if payload else None,
                            text=True, capture_output=True, env=env, check=True)
    return json.loads(result.stdout)


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def field(content, name):
    matches = re.findall(rf'^{name}:=([^\r\n]+)(?=\r?$)', content, re.MULTILINE)
    require(len(matches) == 1, f'Expected exactly one {name} assignment')
    return matches[0]


def version_key(version):
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:_beta(\d*))?', version)
    require(match is not None, 'Unsupported package version')
    return (*map(int, match.groups()[:3]), match[4] is None, int(match[4] or 0))


def validate_makefile(before, after):
    # Preserve line endings and every byte outside the three allowed assignments.
    old = before.decode('utf-8')
    new = after.decode('utf-8')
    values = {name: field(new, name) for name in FIELDS}
    package = values['PKG_VERSION']
    require(version_key(package) > version_key(field(old, 'PKG_VERSION')),
            'Update must increase the Lucky version')
    require(values['LUCKY_RELEASE_DIR'] == 'v' + package.replace('_beta', 'beta'),
            'Release directory does not match the package version')
    require(values['LUCKY_FILE_VERSION'] == package.split('_beta')[0],
            'Archive version does not match the package version')
    require(field(new, 'LUCKY_VARIANT') == 'lucky', 'Unsupported Lucky variant')
    require(field(new, 'LUCKY_RELEASE_BASE') == 'https://release.66666.host',
            'Unexpected upstream download host')
    expected = old
    for name, value in values.items():
        field(old, name)
        expected = re.sub(rf'^{name}:=[^\r\n]+', f'{name}:={value}',
                          expected, flags=re.MULTILINE)
    require(expected.encode('utf-8') == after,
            'Makefile changes include more than the three version fields')
    return package


def read_file(root, sha):
    data = api(f'{root}/contents/{MAKEFILE}?ref={sha}')
    require(data['type'] == 'file' and data['encoding'] == 'base64',
            'Makefile must be a regular UTF-8 file')
    return base64.b64decode(data['content'])


def tree(root, sha):
    commit = api(f'{root}/git/commits/{sha}')
    data = api(f"{root}/git/trees/{commit['tree']['sha']}?recursive=1")
    require(not data.get('truncated'), 'Cannot verify a truncated repository tree')
    return {item['path']: (item['mode'], item['type'], item['sha'])
            for item in data['tree'] if item['type'] != 'tree'}


def verify_build(root, pr, local_build, package):
    sha = pr['head']['sha']
    if local_build:
        require(os.environ.get('GITHUB_WORKFLOW') == 'Update Lucky Version'
                and os.environ.get('GITHUB_EVENT_NAME') in ('schedule', 'workflow_dispatch')
                and os.environ.get('GITHUB_REF') == 'refs/heads/' + pr['base']['ref'],
                'Local build evidence is only accepted from the default-branch updater')
        require(git('rev-parse', 'HEAD') == sha
                and git('rev-parse', 'HEAD^') == os.environ['GITHUB_SHA'],
                'The built checkout is not the generated update commit')
        require(not git('status', '--porcelain', '--', 'lucky', 'luci-app-lucky'),
                'Package sources changed after the update commit')
        artifacts = [p.name for p in Path('dist').glob('*.apk') if p.stat().st_size > 0]
        require(len(artifacts) == 3
                and any(n.startswith(f'lucky-{package}-') and n.endswith('_x86_64.apk') for n in artifacts)
                and any(n.startswith('luci-app-lucky-') and n.endswith('_x86_64.apk') for n in artifacts)
                and any(n.startswith('luci-i18n-lucky-zh-cn-') and n.endswith('_x86_64.apk') for n in artifacts),
                'Expected all three nonempty x86_64 APK artifacts')
        return os.environ['GITHUB_SERVER_URL'] + '/' + os.environ['GITHUB_REPOSITORY'] + '/actions/runs/' + os.environ['GITHUB_RUN_ID']
    # Do not fall back to an earlier success when the latest build failed or is pending.
    data = api(f'{root}/actions/runs?head_sha={sha}&event=pull_request&per_page=100')
    runs = [run for run in data['workflow_runs']
            if run['path'] == BUILD_WORKFLOW and run['head_sha'] == sha
            and run['head_repository']['full_name'] == os.environ['GITHUB_REPOSITORY']]
    require(runs, 'No PR APK build exists for this commit')
    latest = max(runs, key=lambda run: run['id'])
    require(latest['status'] == 'completed' and latest['conclusion'] == 'success',
            'The latest APK build for this commit has not succeeded')
    return latest['html_url']


def validate(root, number, expected_sha, local_build):
    pr = api(f'{root}/pulls/{number}')
    repo = os.environ['GITHUB_REPOSITORY']
    require(pr['state'] == 'open' and not pr['draft'], 'PR must be open and ready for review')
    require(pr['user']['login'] == 'github-actions[bot]' and pr['user']['id'] == 41898282,
            'PR was not created by GitHub Actions')
    require(pr['head']['repo']['full_name'] == repo and pr['base']['repo']['full_name'] == repo,
            'Fork PRs are not eligible for automatic approval')
    require(pr['base']['ref'] == os.environ['DEFAULT_BRANCH'], 'Unexpected target branch')
    require(not expected_sha or pr['head']['sha'] == expected_sha,
            'PR changed after the build was selected')
    require(pr['changed_files'] == 1, 'PR must change only lucky/Makefile')
    files = api(f'{root}/pulls/{number}/files?per_page=100')
    require(len(files) == 1 and files[0]['filename'] == MAKEFILE
            and files[0]['status'] == 'modified', 'Unexpected changed file')
    sha = pr['head']['sha']
    comparison = api(f"{root}/compare/{pr['base']['sha']}...{sha}")
    base = comparison['merge_base_commit']['sha']
    old_tree, new_tree = tree(root, base), tree(root, sha)
    changed = {path for path in old_tree.keys() | new_tree.keys()
               if old_tree.get(path) != new_tree.get(path)}
    require(changed == {MAKEFILE} and old_tree[MAKEFILE][:2] == new_tree[MAKEFILE][:2]
            and new_tree[MAKEFILE][:2] == ('100644', 'blob'),
            'PR changes file modes or repository contents outside the Makefile')
    package = validate_makefile(read_file(root, base), read_file(root, sha))
    require(pr['head']['ref'] == 'automation/update-lucky-' + package,
            'Unexpected update branch name')
    build_url = verify_build(root, pr, local_build, package)
    return pr, package, build_url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pr', default='')
    parser.add_argument('--head', default='')
    parser.add_argument('--local-build', action='store_true')
    parser.add_argument('--approve', action='store_true')
    args = parser.parse_args()
    root = 'repos/' + os.environ['GITHUB_REPOSITORY']
    if args.pr:
        require(args.pr.isdigit() and int(args.pr) > 0, 'Invalid PR number')
        number = int(args.pr)
    else:
        require(re.fullmatch(r'[0-9a-f]{40}', args.head), 'Expected a PR number or build SHA')
        candidates = api(f'{root}/commits/{args.head}/pulls?per_page=100')
        candidates = [pr for pr in candidates if pr['state'] == 'open'
                      and pr['head']['sha'] == args.head
                      and pr['head']['ref'].startswith('automation/update-lucky-')]
        require(len(candidates) == 1, 'Expected exactly one open update PR for this build')
        number = candidates[0]['number']
    pr, package, build_url = validate(root, number, args.head, args.local_build)
    sha = pr['head']['sha']
    print(f'Validated PR #{number}: Lucky {package}, commit {sha}, build {build_url}', flush=True)
    if not args.approve:
        return
    token = os.environ.get('LUCKY_REVIEW_TOKEN')
    require(token, 'Missing repository secret LUCKY_REVIEW_TOKEN')
    reviewer = api('user', token=token)['login']
    reviews = api(f'{root}/pulls/{number}/reviews?per_page=100')
    own = [review for review in reviews if review['user']['login'] == reviewer
           and review['state'] != 'COMMENTED']
    if own and own[-1]['state'] == 'APPROVED' and own[-1]['commit_id'] == sha:
        print('This commit is already approved by the configured reviewer')
        return
    # Refresh immediately before the write; pin the review to the validated commit.
    current = api(f'{root}/pulls/{number}')
    require(current['state'] == 'open' and not current['draft']
            and current['head']['sha'] == sha and current['base']['sha'] == pr['base']['sha'],
            'PR changed during validation; rerun the review')
    result = api(f'{root}/pulls/{number}/reviews', {
        'event': 'APPROVE', 'commit_id': sha,
        'body': f'Automatic review: only the three Lucky version fields changed to {package}; '
                f'the x86_64 APK build passed.\n\nBuild: {build_url}',
    }, token=token)
    require(result['state'] == 'APPROVED' and result['commit_id'] == sha, 'Review was not approved')
    print('Approved: ' + result['html_url'])


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as exc:
        # Never print command environments or token values.
        print(f'Automatic review stopped: {exc}', file=sys.stderr)
        sys.exit(1)
