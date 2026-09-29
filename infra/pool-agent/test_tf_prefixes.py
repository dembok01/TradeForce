"""Shared prefixes: the bookkeeping, without needing root to mount anything.

    python3 -m unittest test_tf_prefixes -v
"""
import os
import tempfile
import unittest

import tf_prefixes as p


class BaseDirTest(unittest.TestCase):
    def test_one_shared_copy_per_image_tag(self):
        self.assertEqual(p.base_dir("tf-mt5:ntsync", base="/srv/tf-base"),
                         "/srv/tf-base/tf-mt5-ntsync")

    def test_a_registry_path_does_not_escape_the_base(self):
        got = p.base_dir("ghcr.io/acme/mt5:v2", base="/srv/tf-base")
        self.assertEqual(got, "/srv/tf-base/ghcr.io-acme-mt5-v2")
        self.assertEqual(os.path.dirname(got), "/srv/tf-base")


class PathsTest(unittest.TestCase):
    def test_the_prefix_the_terminal_sees_sits_where_it_always_did(self):
        got = p.paths("acc1", data="/srv/tf")
        self.assertEqual(got["merged"], "/srv/tf/acc1/.wine")
        self.assertEqual(got["upper"], "/srv/tf/acc1/.wine-upper")
        self.assertEqual(got["root"], "/srv/tf/acc1")


class SharedLayoutTest(unittest.TestCase):
    """The shared copy keeps the .wine element; an account's own layer replaces
    it, so the two paths to the same file are NOT symmetrical. Getting that
    wrong silently disabled MetaTrader build-drift reporting."""

    def test_the_shared_prefix_lives_under_dot_wine(self):
        self.assertEqual(p.paths("acc1", data="/srv/tf")["merged"], "/srv/tf/acc1/.wine")
        self.assertEqual(p.paths("acc1", data="/srv/tf")["upper"], "/srv/tf/acc1/.wine-upper")
        self.assertEqual(p.base_dir("tf-mt5:x", base="/srv/tf-base"), "/srv/tf-base/tf-mt5-x")


class MountTest(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.mkdtemp()

    def test_a_missing_shared_copy_is_refused_before_anything_is_created(self):
        with self.assertRaises(FileNotFoundError):
            p.mount("acc1", os.path.join(self.data, "no-such-base"), data=self.data)
        self.assertFalse(os.path.exists(os.path.join(self.data, "acc1", ".wine-upper")))

    def test_detaching_what_was_never_attached_is_not_an_error(self):
        self.assertFalse(p.unmount("acc1", data=self.data))


class RemountAllTest(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.mkdtemp()

    def account(self, acc, *, upper=True, stamp=None):
        d = os.path.join(self.data, acc)
        os.makedirs(os.path.join(d, ".wine-upper") if upper else d, exist_ok=True)
        if stamp is not None:
            with open(os.path.join(d, ".wine-base"), "w") as f:
                f.write(stamp)

    def test_an_account_with_nothing_written_yet_is_skipped(self):
        self.account("fresh", upper=False)
        self.assertEqual(p.remount_all(self.data), [])

    def test_an_account_whose_base_is_gone_is_reported_not_crashed(self):
        self.account("orphan", stamp="/srv/tf-base/deleted-image/.wine")
        self.assertEqual(p.remount_all(self.data), [])

    def test_an_account_with_no_base_recorded_is_skipped(self):
        self.account("nostamp")
        self.assertEqual(p.remount_all(self.data), [])

    def test_a_missing_data_directory_is_not_an_error(self):
        self.assertEqual(p.remount_all(os.path.join(self.data, "gone")), [])


if __name__ == "__main__":
    unittest.main()
