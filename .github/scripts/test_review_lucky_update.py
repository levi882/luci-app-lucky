"""Exercise the approval boundary without submitting GitHub reviews."""
import copy
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('review_lucky_update.py'))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
BEFORE = (b'PKG_VERSION:=3.1.3_beta\nLUCKY_RELEASE_DIR:=v3.1.3beta\n'
          b'LUCKY_FILE_VERSION:=3.1.3\nLUCKY_VARIANT:=lucky\n'
          b'LUCKY_RELEASE_BASE:=https://release.66666.host\nPKG_HASH:=skip\n')
AFTER = BEFORE.replace(b'3.1.3', b'3.1.4')


class ReviewTests(unittest.TestCase):
    def test_version_bump_and_line_endings(self):
        for ending in (b'\n', b'\r\n'):
            with self.subTest(ending=ending):
                self.assertEqual(review.validate_makefile(BEFORE.replace(b'\n', ending),
                                                         AFTER.replace(b'\n', ending)), '3.1.4_beta')

    def test_non_version_changes_are_rejected(self):
        for content in (AFTER + b'$(shell echo injected)\n',
                        AFTER.replace(b'PKG_HASH:=skip', b'PKG_HASH:=other'),
                        AFTER.replace(b'https://release.66666.host', b'https://example.com'),
                        AFTER.replace(b'LUCKY_VARIANT:=lucky', b'LUCKY_VARIANT:=other'),
                        AFTER + b'PKG_VERSION:=3.1.4_beta\n',
                        AFTER.replace(b'v3.1.4beta', b'v3.1.5beta'),
                        AFTER.replace(b'LUCKY_FILE_VERSION:=3.1.4', b'LUCKY_FILE_VERSION:=3.1.5'),
                        BEFORE, BEFORE.replace(b'3.1.3', b'3.1.2')):
            with self.subTest(content=content):
                with self.assertRaises(ValueError):
                    review.validate_makefile(BEFORE, content)

    def test_version_order(self):
        self.assertLess(review.version_key('3.1.4_beta'), review.version_key('3.1.4_beta8'))
        self.assertLess(review.version_key('3.1.4_beta8'), review.version_key('3.1.4'))
        self.assertLess(review.version_key('3.1.4'), review.version_key('3.1.5_beta'))

    def setUp(self):
        self.pr = {'state': 'open', 'draft': False, 'changed_files': 1,
                   'user': {'login': 'github-actions[bot]', 'id': 41898282},
                   'head': {'sha': 'a' * 40, 'ref': 'automation/update-lucky-3.1.4_beta',
                            'repo': {'full_name': 'owner/repo'}},
                   'base': {'sha': 'b' * 40, 'ref': 'main', 'repo': {'full_name': 'owner/repo'}}}
        self.root = 'repos/owner/repo'
        self.env = patch.dict(os.environ, {'GITHUB_REPOSITORY': 'owner/repo', 'DEFAULT_BRANCH': 'main'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def fake_api(self, path):
        if path == self.root + '/pulls/5':
            return self.pr
        if path.endswith('/files?per_page=100'):
            return [{'filename': review.MAKEFILE, 'status': 'modified'}]
        if '/compare/' in path:
            return {'merge_base_commit': {'sha': 'c' * 40}}
        raise AssertionError('Unexpected API read: ' + path)

    def run_validation(self, old_tree=None, new_tree=None):
        old_tree = old_tree or {review.MAKEFILE: ('100644', 'blob', 'old')}
        new_tree = new_tree or {review.MAKEFILE: ('100644', 'blob', 'new')}
        with patch.object(review, 'api', side_effect=self.fake_api), \
             patch.object(review, 'tree', side_effect=[old_tree, new_tree]), \
             patch.object(review, 'read_file', side_effect=[BEFORE, AFTER]), \
             patch.object(review, 'verify_build', return_value='build-url'):
            return review.validate(self.root, 5, 'a' * 40, False)

    def test_valid_pr(self):
        self.assertEqual(self.run_validation()[1], '3.1.4_beta')

    def test_ineligible_prs(self):
        original = copy.deepcopy(self.pr)
        mutations = [('state', 'closed'), ('draft', True), ('changed_files', 2),
                     ('user', {'login': 'human', 'id': 1}),
                     ('head', {**original['head'], 'sha': 'd' * 40}),
                     ('head', {**original['head'], 'repo': {'full_name': 'fork/repo'}}),
                     ('head', {**original['head'], 'ref': 'random-branch'}),
                     ('base', {**original['base'], 'ref': 'other'})]
        for key, value in mutations:
            self.pr = copy.deepcopy(original)
            self.pr[key] = value
            with self.subTest(key=key, value=value):
                with self.assertRaises(ValueError):
                    self.run_validation()

    def test_file_mode_and_extra_files(self):
        for tree in ({review.MAKEFILE: ('100755', 'blob', 'new')},
                     {review.MAKEFILE: ('100644', 'blob', 'new'), 'injected.sh': ('100644', 'blob', 'x')}):
            with self.subTest(tree=tree):
                with self.assertRaises(ValueError):
                    self.run_validation(new_tree=tree)

    def test_latest_build_must_succeed(self):
        run = {'id': 1, 'path': review.BUILD_WORKFLOW, 'head_sha': 'a' * 40,
               'head_repository': {'full_name': 'owner/repo'}, 'status': 'completed',
               'conclusion': 'success', 'html_url': 'build-url'}
        with patch.object(review, 'api', return_value={'workflow_runs': [run]}):
            self.assertEqual(review.verify_build(self.root, self.pr, False, '3.1.4_beta'), 'build-url')
        for status, conclusion in [('in_progress', None), ('completed', 'failure'),
                                   ('completed', 'cancelled'), ('completed', 'skipped')]:
            with self.subTest(status=status, conclusion=conclusion), \
                 patch.object(review, 'api', return_value={'workflow_runs': [run, {
                     **run, 'id': 2, 'status': status, 'conclusion': conclusion}]}):
                with self.assertRaises(ValueError):
                    review.verify_build(self.root, self.pr, False, '3.1.4_beta')

    def test_no_matching_build(self):
        with patch.object(review, 'api', return_value={'workflow_runs': []}):
            with self.assertRaises(ValueError):
                review.verify_build(self.root, self.pr, False, '3.1.4_beta')

    def test_local_build_not_accepted_from_other_workflows(self):
        with patch.dict(os.environ, {'GITHUB_WORKFLOW': 'Other workflow'}):
            with self.assertRaises(ValueError):
                review.verify_build(self.root, self.pr, True, '3.1.4_beta')

    def test_already_approved_commit_is_not_posted_again(self):
        def api(path, payload=None, token=None):
            self.assertIsNone(payload, 'Duplicate approval must not be posted')
            if path == 'user':
                return {'login': 'reviewer'}
            if '/reviews?' in path:
                return [{'user': {'login': 'reviewer'}, 'state': 'APPROVED', 'commit_id': 'a' * 40}]
            self.fail('Unexpected API request: ' + path)

        with patch.object(review, 'validate', return_value=(self.pr, '3.1.4_beta', 'build-url')), \
             patch.object(review, 'api', side_effect=api), \
             patch.dict(os.environ, {'LUCKY_REVIEW_TOKEN': 'fake-test-token'}), \
             patch('sys.argv', ['review', '--pr', '5', '--approve']):
            review.main()

    def test_changed_pr_is_not_approved(self):
        calls = []

        def api(path, payload=None, token=None):
            calls.append((path, payload))
            if path == 'user':
                return {'login': 'reviewer'}
            if '/reviews?' in path:
                return []
            if path.endswith('/pulls/5'):
                return {**self.pr, 'head': {**self.pr['head'], 'sha': 'd' * 40}}
            self.fail('Review write must never be reached')

        with patch.object(review, 'validate', return_value=(self.pr, '3.1.4_beta', 'build-url')), \
             patch.object(review, 'api', side_effect=api), \
             patch.dict(os.environ, {'LUCKY_REVIEW_TOKEN': 'fake-test-token'}), \
             patch('sys.argv', ['review', '--pr', '5', '--approve']):
            with self.assertRaises(ValueError):
                review.main()
        self.assertTrue(all(payload is None for _, payload in calls))


if __name__ == '__main__':
    unittest.main()
