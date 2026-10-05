// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Which update channel to check. A beta build follows the betas whatever the setting says: GitHub
// never counts a pre-release as the latest release, so a beta on the stable channel would find
// nothing until the next stable release. The beta channel also offers stable releases, so a
// tester moves to the stable version when it ships, and from then on follows the setting.
function updateChannel(setting, version) {
  return setting === 'beta' || /-/.test(String(version)) ? 'beta' : 'latest';
}

module.exports = { updateChannel };
