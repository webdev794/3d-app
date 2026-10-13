import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';
import 'onboarding.dart' show editServer;

class _Tabs extends StatelessWidget {
  const _Tabs({
    required this.labels,
    required this.selected,
    required this.onSelect,
  });
  final List<String> labels;
  final String selected;
  final ValueChanged<String> onSelect;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 18),
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      color: Palette.surface,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Palette.border),
    ),
    child: Row(
      children: [
        for (final label in labels)
          Expanded(
            child: GestureDetector(
              onTap: () => onSelect(label),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  gradient: selected == label
                      ? const LinearGradient(
                          colors: [Palette.cyan, Palette.blue],
                        )
                      : null,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: selected == label ? Colors.black : Palette.muted,
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// 15 · My Projects.
class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen(this.c, {super.key});
  final AppController c;
  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  String _tab = 'All Designs';

  Future<void> _confirmDelete(Project p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        backgroundColor: Palette.surface,
        title: Text('Delete "${p.title}"?'),
        content: const Text('This removes the design from this device.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text(
              'Delete',
              style: TextStyle(color: Color(0xffff6b78)),
            ),
          ),
        ],
      ),
    );
    if (ok == true) widget.c.deleteProject(p);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final shown = c.projects.where(
      (p) => switch (_tab) {
        'AI Designs' => p.mode == 'AI',
        'DYO Designs' => p.mode == 'DYO',
        _ => true,
      },
    );
    return Column(
      children: [
        TopBar(
          title: 'My projects',
          trailing: [
            IconButton(
              tooltip: 'New design',
              onPressed: () => c.go(AppScreen.home),
              icon: const Icon(Icons.add_circle_outline, color: Palette.cyan),
            ),
          ],
        ),
        _Tabs(
          labels: const ['All Designs', 'AI Designs', 'DYO Designs'],
          selected: _tab,
          onSelect: (t) => setState(() => _tab = t),
        ),
        Expanded(
          child: shown.isEmpty
              ? const Center(
                  child: Text(
                    'No designs here yet.',
                    style: TextStyle(color: Palette.muted),
                  ),
                )
              : GridView(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: .78,
                  ),
                  children: [
                    for (final p in shown)
                      GlowCard(
                        glow: false,
                        onTap: () => c.loadProject(p),
                        onLongPress: () => _confirmDelete(p),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  p.thumbnail == null && p.asset == null
                                      ? _Swatch(p)
                                      : artImage(
                                          bytes: p.thumbnail,
                                          asset: p.asset,
                                        ),
                                  if (p.remoteId != null || p.syncError != null)
                                    Positioned(
                                      top: 7,
                                      right: 7,
                                      child: Icon(
                                        p.syncError != null
                                            ? Icons.cloud_off_outlined
                                            : p.pendingUpload
                                            ? Icons.cloud_upload_outlined
                                            : Icons.cloud_done_outlined,
                                        size: 17,
                                        color: Palette.cyan,
                                        shadows: const [Shadow(blurRadius: 6)],
                                      ),
                                    ),
                                  if (p.localSaveError != null)
                                    Positioned(
                                      left: 7,
                                      top: 7,
                                      child: Tooltip(
                                        message: p.localSaveError!,
                                        child: const Icon(
                                          Icons.warning_amber_rounded,
                                          color: Color(0xffffbc75),
                                          size: 18,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(10, 8, 10, 9),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    p.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 12.5,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${p.sport} · v${p.version} · ${p.age}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Palette.muted,
                                      fontSize: 10.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        BottomNav(controller: c),
      ],
    );
  }
}

/// 16 · Assets: logos, patterns, artwork and uploads.
class AssetsScreen extends StatefulWidget {
  const AssetsScreen(this.c, {super.key});
  final AppController c;
  @override
  State<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends State<AssetsScreen> {
  String _tab = 'Logos';
  AppController get c => widget.c;

  List<Uint8List> get _items => switch (_tab) {
    'Logos' => c.logos,
    'Patterns' => c.aiPatterns,
    'Artwork' => c.artwork,
    _ => c.uploads,
  };

  Future<void> _upload() async {
    final bytes = await pickPhoto(context);
    if (bytes == null) return;
    setState(() => (_tab == 'Logos' ? c.logos : c.uploads).add(bytes));
  }

  Future<void> _use(Uint8List? bytes, {String? asset}) async {
    final data =
        bytes ??
        (asset == null
            ? null
            : (await rootBundle.load(asset)).buffer.asUint8List());
    if (data == null || !mounted) return;
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Palette.surface,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 170,
                child: artImage(bytes: data, fit: BoxFit.contain),
              ),
              const SizedBox(height: 12),
              if (_tab != 'Patterns')
                ListTile(
                  leading: const Icon(Icons.shield_outlined),
                  title: const Text('Use as chest logo'),
                  onTap: () => Navigator.pop(sheet, 'logo'),
                ),
              if (_tab == 'Patterns')
                ListTile(
                  leading: const Icon(Icons.grid_view_rounded),
                  title: const Text('Use as print pattern'),
                  onTap: () => Navigator.pop(sheet, 'pattern'),
                ),
              ListTile(
                leading: const Icon(Icons.auto_awesome),
                title: const Text('Use as AI reference'),
                onTap: () => Navigator.pop(sheet, 'reference'),
              ),
            ],
          ),
        ),
      ),
    );
    if (action == null) return;
    switch (action) {
      case 'logo':
        if (!c.logos.contains(data)) c.logos.add(data);
        c.edit(() => c.logoImage = data);
        c.go(AppScreen.studio);
      case 'pattern':
        c.edit(() => c.patternTile = asset == null ? data : null);
        c.go(AppScreen.studio);
      case 'reference':
        c.startAi();
        c.update(() => c.references.add(data));
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final canUpload = _tab == 'Logos' || _tab == 'Uploads';
    return Column(
      children: [
        const TopBar(title: 'Assets', subtitle: 'Logos · patterns · artwork'),
        _Tabs(
          labels: const ['Logos', 'Patterns', 'Artwork', 'Uploads'],
          selected: _tab,
          onSelect: (t) => setState(() => _tab = t),
        ),
        Expanded(
          child: GridView(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
            ),
            children: [
              if (canUpload)
                GlowCard(
                  radius: 12,
                  glow: false,
                  onTap: _upload,
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add, color: Palette.cyan, size: 28),
                      SizedBox(height: 4),
                      Text(
                        'Upload asset',
                        style: TextStyle(fontSize: 10, color: Palette.muted),
                      ),
                    ],
                  ),
                ),
              if (_tab == 'Patterns')
                GlowCard(
                  radius: 12,
                  glow: false,
                  onTap: () =>
                      _use(null, asset: 'assets/images/pattern_default.png'),
                  child: artImage(asset: 'assets/images/pattern_default.png'),
                ),
              // Bundled samples so a new library is never empty.
              for (final sample in switch (_tab) {
                'Logos' => const [
                  'assets/images/splash_mark.png',
                  'assets/images/reference_1.png',
                ],
                'Uploads' => const [
                  'assets/images/reference_2.png',
                  'assets/images/reference_3.png',
                  'assets/images/reference_4.png',
                ],
                _ => const <String>[],
              })
                GlowCard(
                  radius: 12,
                  glow: false,
                  onTap: () => _use(null, asset: sample),
                  child: artImage(
                    asset: sample,
                    fit: _tab == 'Logos' ? BoxFit.contain : BoxFit.cover,
                  ),
                ),
              if (_tab == 'Artwork')
                for (var i = 1; i <= 6; i++)
                  GlowCard(
                    radius: 12,
                    glow: false,
                    onTap: () =>
                        _use(null, asset: 'assets/images/project_$i.png'),
                    child: artImage(asset: 'assets/images/project_$i.png'),
                  ),
              for (final item in items.reversed)
                GlowCard(
                  radius: 12,
                  glow: false,
                  onTap: () => _use(item),
                  child: artImage(
                    bytes: item,
                    fit: _tab == 'Logos' ? BoxFit.contain : BoxFit.cover,
                  ),
                ),
            ],
          ),
        ),
        if (items.isEmpty && _tab == 'Patterns')
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(switch (_tab) {
              'Logos' => 'Upload your club crest to place it on any kit.',
              'Patterns' => 'AI patterns you generate are kept here.',
              _ => 'Reference photos you add appear here.',
            }, style: const TextStyle(color: Palette.muted, fontSize: 11.5)),
          ),
        BottomNav(controller: c),
      ],
    );
  }
}

/// Profile.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen(this.c, {super.key});
  final AppController c;

  Widget _stat(String value, String label) => Column(
    children: [
      Text(
        value,
        style: const TextStyle(
          fontFamily: 'Rajdhani',
          fontSize: 28,
          color: Palette.cyan,
          fontWeight: FontWeight.w700,
        ),
      ),
      Text(label, style: const TextStyle(color: Palette.muted, fontSize: 10)),
    ],
  );

  Widget _row(IconData icon, String label, VoidCallback tap) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon, color: Palette.cyan, size: 22),
    title: Text(label, style: const TextStyle(fontSize: 13)),
    trailing: const Icon(Icons.chevron_right, size: 18),
    onTap: tap,
  );

  @override
  Widget build(BuildContext context) => Column(
    children: [
      const TopBar(title: 'Profile'),
      Expanded(
        child: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            const Center(
              child: CircleAvatar(
                radius: 38,
                backgroundColor: Color(0xff113342),
                child: Icon(
                  Icons.person_outline_rounded,
                  size: 41,
                  color: Palette.cyan,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              c.name,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              c.signedIn
                  ? c.user!.email
                  : 'Guest · projects stay on this device',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Palette.muted, fontSize: 12),
            ),
            const SizedBox(height: 14),
            _SyncCard(c),
            const SizedBox(height: 26),
            SurfaceCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _stat('${c.projects.length}', 'Projects'),
                  _stat(
                    '${c.logos.length + c.aiPatterns.length + c.uploads.length + c.artwork.length}',
                    'Assets',
                  ),
                  _stat(
                    '${c.projects.where((p) => p.mode == 'AI').length}',
                    'AI designs',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _row(Icons.auto_awesome, 'New AI design', c.startAi),
            _row(Icons.design_services_outlined, 'Design your own', c.startDyo),
            _row(
              Icons.folder_outlined,
              'My projects',
              () => c.go(AppScreen.projects),
            ),
            _row(
              Icons.layers_outlined,
              'Asset library',
              () => c.go(AppScreen.assets),
            ),
            const SizedBox(height: 22),
            _row(
              Icons.dns_outlined,
              'Server · ${c.api.host}',
              () => editServer(context, c),
            ),
            const SizedBox(height: 12),
            SecondaryButton(
              label: c.signedIn ? 'Sign out' : 'Sign in or register',
              icon: c.signedIn ? Icons.logout : Icons.login,
              onPressed: () async {
                if (c.signedIn) await c.signOut();
                c.go(AppScreen.auth);
              },
            ),
          ],
        ),
      ),
      BottomNav(controller: c),
    ],
  );
}

/// Cloud status: signed in and synced, syncing, or why it failed.
class _SyncCard extends StatelessWidget {
  const _SyncCard(this.c);
  final AppController c;

  @override
  Widget build(BuildContext context) {
    final failed = c.projects.where((p) => p.syncError != null).toList();
    final waiting = c.projects.where((p) => p.pendingUpload).length;
    final cloud = c.projects.where((p) => p.remoteId != null).length;
    final (IconData icon, String text) = !c.signedIn
        ? (
            Icons.cloud_off_outlined,
            c.syncMessage ?? 'Sign in to save projects to your account.',
          )
        : c.syncing
        ? (Icons.cloud_sync_outlined, 'Syncing with ${c.api.host}…')
        : c.syncMessage != null
        ? (Icons.cloud_off_outlined, c.syncMessage!)
        : failed.isNotEmpty
        ? (Icons.cloud_off_outlined, failed.first.syncError!)
        : (
            Icons.cloud_done_outlined,
            '$cloud project${cloud == 1 ? '' : 's'} saved to your account'
                '${waiting > 0 ? ' · $waiting waiting to upload' : ''}',
          );
    return SurfaceCard(
      child: Row(
        children: [
          Icon(icon, color: Palette.cyan, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 12.5, height: 1.35),
            ),
          ),
          if (c.signedIn && !c.syncing)
            TextButton(
              onPressed: c.syncProjects,
              child: const Text('Sync now'),
            ),
        ],
      ),
    );
  }
}

/// A project made on the website has no picture yet: show its colours.
class _Swatch extends StatelessWidget {
  const _Swatch(this.p);
  final Project p;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [p.kit.mainColor, p.kit.secondaryColor],
      ),
    ),
    child: Center(
      child: Text(
        p.kit.logoText.isEmpty ? p.garment : p.kit.logoText,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontFamily: 'Rajdhani',
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: p.kit.accentColor,
          shadows: const [Shadow(blurRadius: 8)],
        ),
      ),
    ),
  );
}
