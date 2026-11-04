import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../assist.dart';
import '../widgets/bubble_page.dart';
import '../widgets/flow_ui.dart';
import '../widgets/glass_bubble.dart';
import '../widgets/notification_bell.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart';
import '../widgets/ui.dart';
import 'bubble_home.dart' show BubbleTutorial;
import 'business.dart';
import 'edit_profile.dart';
import 'image_editor.dart';
import 'onboarding.dart' show editServer;
import 'team.dart' show TeamScreen;

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
  String _tab = 'All';

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

  /// Long-press: order the kit or delete it (as the website's project menu).
  Future<void> _actions(Project p) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Palette.surface,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(
                p.title,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                p.approved
                    ? 'Approved for production'
                    : '${p.sport} · v${p.version}',
              ),
            ),
            ListTile(
              leading: const Icon(Icons.edit_outlined, color: Palette.cyan),
              title: const Text('Open in the studio'),
              onTap: () => Navigator.pop(sheet, 'open'),
            ),
            ListTile(
              leading: const Icon(
                Icons.local_shipping_outlined,
                color: Palette.cyan,
              ),
              title: const Text('Order this kit'),
              onTap: () => Navigator.pop(sheet, 'order'),
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_outline,
                color: Color(0xffff6b78),
              ),
              title: const Text('Delete'),
              onTap: () => Navigator.pop(sheet, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (action) {
      case 'open':
        widget.c.loadProject(p);
      case 'order':
        await showOrderKitSheet(context, widget.c, p);
      case 'delete':
        await _confirmDelete(p);
    }
  }

  /// The search box's text (matched against the name and the sport).
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final q = _search.text.trim().toLowerCase();
    final shown = c.projects.where(
      (p) =>
          switch (_tab) {
            'AI' => p.mode == 'AI',
            'DYO' => p.mode == 'DYO',
            'Approved' => p.approved,
            _ => true,
          } &&
          (q.isEmpty ||
              p.title.toLowerCase().contains(q) ||
              p.sport.toLowerCase().contains(q) ||
              p.kit.productName.toLowerCase().contains(q)),
    );
    // The bubble look (client picture images/334, 2026-11-03): PROJECTS in one
    // glass bubble with search, filter pills, glass kit cards and New project.
    return BubblePage(
      c: c,
      title: 'PROJECTS',
      subtitle: 'Pick up where you left off.',
      bubbleKey: const ValueKey('projects-bubble'),
      scrolls: true,
      // Assets left the bottom bar (client picture 168.jpg): it opens from here and from Profile.
      // A small, quiet chip (client picture images/344 has none; kept for Assets).
      leading: Semantics(
        button: true,
        label: 'Assets',
        excludeSemantics: true,
        child: Material(
          key: const ValueKey('projects-assets'),
          color: const Color(0x66061528),
          shape: StadiumBorder(
            side: BorderSide(color: Palette.cyan.withValues(alpha: .3)),
          ),
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: () => c.go(AppScreen.assets),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 9, vertical: 5),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.layers_outlined, size: 13, color: Palette.muted),
                  SizedBox(width: 4),
                  Text(
                    'Assets',
                    style: TextStyle(fontSize: 11, color: Color(0xffb9c5cf)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 42,
            child: GlassShine(
              radius: 22,
              child: TextField(
                key: const ValueKey('projects-search'),
                controller: _search,
                onChanged: (_) => setState(() {}),
                textInputAction: TextInputAction.search,
                style: const TextStyle(fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Search projects',
                  prefixIcon: const Icon(Icons.search, size: 20),
                  isDense: true,
                  filled: true,
                  fillColor: const Color(0x99061528),
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide(
                      color: Palette.cyan.withValues(alpha: .35),
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide(
                      color: Palette.cyan.withValues(alpha: .35),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          // All four fit inside the bubble (images/344).
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              children: [
                for (final t in const ['All', 'AI', 'DYO', 'Approved'])
                  Expanded(
                    flex: t == 'Approved' ? 5 : 4,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: _FilterPill(
                        label: t,
                        selected: _tab == t,
                        onTap: () => setState(() => _tab = t),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            child: shown.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Text(
                        q.isNotEmpty
                            ? 'No projects match "${_search.text.trim()}".'
                            : _tab == 'Approved'
                            ? 'Kits approved for production by 3DEEZI appear here.'
                            : 'No designs here yet.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Palette.muted),
                      ),
                    ),
                  )
                : GridView(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(2, 2, 2, 8),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: .86,
                        ),
                    children: [
                      for (final p in shown)
                        _ProjectCard(
                          p: p,
                          onTap: () => c.loadProject(p),
                          onMenu: () => _actions(p),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              key: const ValueKey('projects-new'),
              onPressed: () => c.go(AppScreen.home),
              style: FilledButton.styleFrom(
                backgroundColor: Palette.cyan,
                foregroundColor: const Color(0xff04121f),
                shape: const StadiumBorder(),
                textStyle: const TextStyle(
                  fontSize: 16,
                  fontFamily: 'Inter',
                  fontWeight: FontWeight.w800,
                ),
              ),
              icon: const Icon(Icons.add, size: 22),
              label: const Text('New project'),
            ),
          ),
          Center(
            child: BubbleAssistLink(
              onPressed: () => AssistController.latest?.show(),
            ),
          ),
        ],
      ),
    );
  }
}

/// A filter pill (All / AI / DYO / Approved): glass, lit when chosen.
class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GlassShine(
    radius: 22,
    child: Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected ? const Color(0xff0f5d8a) : const Color(0x99061528),
        shape: StadiumBorder(
          side: BorderSide(
            color: selected ? Palette.cyan : Palette.cyan.withValues(alpha: .3),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: SizedBox(
            height: 30,
            child: Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : const Color(0xffb9c5cf),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/// A kit as a glass card: its picture, its name, "Updated 2h ago" and the
/// ⋯ menu (open, order, delete; a long press opens it too).
class _ProjectCard extends StatelessWidget {
  const _ProjectCard({
    required this.p,
    required this.onTap,
    required this.onMenu,
  });
  final Project p;
  final VoidCallback onTap, onMenu;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onLongPress: onMenu,
    child: _ThinGlass(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(5, 5, 5, 0),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(11),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    p.thumbnail == null && p.asset == null
                        ? _Swatch(p)
                        : artImage(bytes: p.thumbnail, asset: p.asset),
                    if (p.remoteId != null || p.syncError != null)
                      Positioned(
                        top: 6,
                        left: 6,
                        child: Icon(
                          p.syncError != null
                              ? Icons.cloud_off_outlined
                              : p.pendingUpload
                              ? Icons.cloud_upload_outlined
                              : Icons.cloud_done_outlined,
                          size: 16,
                          color: Palette.cyan,
                          shadows: const [Shadow(blurRadius: 6)],
                        ),
                      ),
                    Positioned(
                      top: 0,
                      right: 0,
                      child: IconButton(
                        tooltip: 'More for ${p.title}',
                        visualDensity: VisualDensity.compact,
                        onPressed: onMenu,
                        icon: const Icon(
                          Icons.more_horiz,
                          color: Colors.white,
                          shadows: [Shadow(blurRadius: 6)],
                        ),
                      ),
                    ),
                    if (p.approved)
                      Positioned(
                        left: 7,
                        bottom: 7,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xe6052a1f),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xff34d399)),
                          ),
                          child: const Text(
                            'APPROVED',
                            style: TextStyle(
                              color: Color(0xff34d399),
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: .8,
                            ),
                          ),
                        ),
                      ),
                    if (p.localSaveError != null)
                      Positioned(
                        left: 7,
                        top: 26,
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
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 10, 9),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Updated ${p.age}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Palette.muted, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
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
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit image'),
                onTap: () => Navigator.pop(sheet, 'edit'),
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
      case 'edit':
        // The image editor; Save keeps the chosen version as a new picture.
        if (!mounted) return;
        final tab = _tab, list = _items;
        final edited = await openImageEditor(
          context,
          c,
          bytes: data,
          title: tab,
          fileName: '3deezi-${tab.toLowerCase()}',
          useLabel: 'Save',
        );
        if (edited == null || !mounted) return;
        setState(() => list.add(edited));
        showToast(context, 'Saved as a new picture in $tab.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final canUpload = _tab == 'Logos' || _tab == 'Uploads';
    return Column(
      children: [
        TopBar(
          // Opened from Projects or Profile (no longer a bottom-bar tab).
          onBack: c.back,
          title: 'Assets',
          subtitle: 'Logos · patterns · artwork',
          trailing: [NotificationBell(widget.c)],
        ),
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

  // The arrows sit left of the round Assist button (bottom right), so it never
  // covers them (QA 10-28: "Orders" and "My orders").
  Widget _row(IconData icon, String label, VoidCallback tap) => ListTile(
    contentPadding: const EdgeInsets.only(left: 14, right: 10),
    dense: true,
    minTileHeight: 40,
    visualDensity: const VisualDensity(vertical: -4),
    leading: Icon(icon, color: Palette.cyan, size: 22),
    title: Text(label, style: const TextStyle(fontSize: 14)),
    trailing: const Icon(Icons.chevron_right, size: 20),
    onTap: tap,
  );

  /// A list of rows, each its own glass pill (client images/344).
  Widget _glassList(List<Widget> rows) => Column(
    children: [
      for (var i = 0; i < rows.length; i++)
        Padding(
          padding: EdgeInsets.only(top: i == 0 ? 0 : 6),
          child: _ThinGlass(radius: 24, rim: 1, child: rows[i]),
        ),
    ],
  );

  /// The two letters in the round avatar ("FS" for Fabian Soutar).
  static String initials(String name) {
    final words = name
        .split(RegExp(r'[\s@._-]+'))
        .where((w) => w.isNotEmpty)
        .toList();
    if (words.isEmpty) return '?';
    final a = words.first[0], b = words.length > 1 ? words[1][0] : '';
    return (a + b).toUpperCase();
  }

  // StatefulBuilder: Profile shows the new name and email after Edit profile.
  @override
  Widget build(BuildContext context) =>
      StatefulBuilder(builder: (context, refresh) => _build(context, refresh));

  Future<void> _editProfile(BuildContext context, StateSetter refresh) async {
    if (!c.signedIn) {
      c.go(AppScreen.auth);
      return;
    }
    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => EditProfileScreen(c)));
    refresh(() {});
  }

  Future<void> _notifications(BuildContext context) async {
    if (!c.signedIn) {
      showToast(context, 'Sign in to see your notifications.');
      return;
    }
    final tapped = await showModalBottomSheet<Map>(
      context: context,
      backgroundColor: Palette.surface,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => NotificationsSheet(c),
    );
    if (tapped != null && context.mounted) {
      await openNotification(context, c, tapped);
    }
  }

  void _addresses(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    backgroundColor: Palette.surface,
    builder: (sheet) => const SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(22, 22, 22, 26),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Saved addresses',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 10),
            Text(
              'No saved addresses yet. The order form asks where to deliver '
              'each order; saving addresses here is coming soon.',
              style: TextStyle(color: Palette.muted, height: 1.4),
            ),
          ],
        ),
      ),
    ),
  );

  void _help(BuildContext context) => showModalBottomSheet<void>(
    context: context,
    backgroundColor: Palette.surface,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const ListTile(
            title: Text(
              'Help & tutorials',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.play_circle_outline, color: Palette.cyan),
            title: const Text('Replay the home tutorial'),
            onTap: () {
              Navigator.pop(sheet);
              BubbleTutorial.open(context);
            },
          ),
          ListTile(
            leading: const Icon(Icons.auto_awesome, color: Palette.cyan),
            title: const Text('Ask 3DEEZI Assist'),
            onTap: () {
              Navigator.pop(sheet);
              AssistController.latest?.show();
            },
          ),
          ListTile(
            leading: const Icon(
              Icons.support_agent_outlined,
              color: Palette.cyan,
            ),
            title: const Text('Support'),
            onTap: () {
              Navigator.pop(sheet);
              openSitePage(context, c.api.sitePage('/support'), 'Support');
            },
          ),
        ],
      ),
    ),
  );

  // The bubble look (client picture images/334, 2026-11-03): PROFILE in one
  // glass bubble: the round initials, the name and "Account settings", the
  // glass list (Personal details, Subscription, Saved addresses,
  // Notifications, Help & tutorials), Sign out, Rewards and Assist; the rest
  // of the old list (projects, assets, orders, team, the site's pages, the
  // server) stays below under MORE.
  Widget _build(BuildContext context, StateSetter refresh) {
    final name = c.signedIn
        ? (c.user!.name.trim().isNotEmpty ? c.user!.name.trim() : c.user!.email)
        : 'Guest';
    return BubblePage(
      c: c,
      title: 'PROFILE',
      bubbleKey: const ValueKey('profile-bubble'),
      // The whole page scrolls and the bubble grows, like Orders.
      scrolls: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(2, 0, 2, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  top: -30,
                  child: IgnorePointer(
                    child: Opacity(
                      opacity: .13,
                      child: Image.asset(
                        'assets/images/emblem-final.png',
                        width: 260,
                        color: const Color(0xff4fb8ff),
                        colorBlendMode: BlendMode.srcIn,
                        errorBuilder: (_, _, _) => const SizedBox(),
                      ),
                    ),
                  ),
                ),
                Center(
                  child: Container(
                    width: 84,
                    height: 84,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const RadialGradient(
                        center: Alignment(-.3, -.4),
                        colors: [Color(0xff1d5fa8), Color(0xff071a36)],
                      ),
                      border: Border.all(color: Palette.cyan, width: 2.4),
                      boxShadow: [
                        BoxShadow(
                          color: Palette.cyan.withValues(alpha: .45),
                          blurRadius: 18,
                        ),
                      ],
                    ),
                    child: c.signedIn
                        ? Text(
                            initials(name),
                            key: const ValueKey('profile-initials'),
                            style: const TextStyle(
                              fontFamily: 'Rajdhani',
                              fontWeight: FontWeight.w700,
                              fontSize: 32,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(
                            Icons.person_outline_rounded,
                            size: 40,
                            color: Palette.cyan,
                          ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // The account's own name (its email when it has none); a guest is
            // "Guest", never the demo name in AppController.name.
            Text(
              name,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            if (c.signedIn && c.user!.email.isNotEmpty)
              Text(
                c.user!.email,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Palette.muted, fontSize: 12),
              ),
            const SizedBox(height: 2),
            Center(
              child: TextButton(
                onPressed: () => _editProfile(context, refresh),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xffd3dee8),
                  visualDensity: VisualDensity.compact,
                ),
                child: Text(
                  c.signedIn
                      ? 'Account settings'
                      : 'Guest · projects stay on this device',
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ),
            const SizedBox(height: 8),
            _glassList([
              _row(
                Icons.person_outline,
                'Personal details',
                () => _editProfile(context, refresh),
              ),
              _row(
                Icons.layers_outlined,
                'Subscription',
                () => c.go(AppScreen.pricing),
              ),
              _row(
                Icons.location_on_outlined,
                'Saved addresses',
                () => _addresses(context),
              ),
              _row(
                Icons.notifications_none_rounded,
                'Notifications',
                () => _notifications(context),
              ),
              _row(
                Icons.help_outline,
                'Help & tutorials',
                () => _help(context),
              ),
            ]),
            const SizedBox(height: 14),
            Center(
              child: SizedBox(
                width: 335,
                height: 46,
                child: _ThinGlass(
                  radius: 24,
                  key: const ValueKey('profile-sign-out'),
                  onTap: () async {
                    if (c.signedIn) await c.signOut();
                    c.go(AppScreen.auth);
                  },
                  semanticsLabel: c.signedIn
                      ? 'Sign out'
                      : 'Sign in or register',
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            c.signedIn ? Icons.logout : Icons.login,
                            size: 20,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            c.signedIn ? 'Sign out' : 'Sign in or register',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            const FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'REWARDS · COMING SOON',
                    style: TextStyle(
                      fontFamily: 'Rajdhani',
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      letterSpacing: 2,
                      color: Color(0xffd3dee8),
                    ),
                  ),
                  SizedBox(width: 6),
                  Icon(Icons.auto_awesome, size: 16, color: Palette.cyan),
                ],
              ),
            ),
            Center(
              child: BubbleAssistLink(
                onPressed: () => AssistController.latest?.show(),
              ),
            ),
            const SizedBox(height: 14),
            const Padding(
              padding: EdgeInsets.only(left: 6, bottom: 6),
              child: Text(
                'MORE',
                style: TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  letterSpacing: 2,
                  color: Color(0xff9fb0bf),
                ),
              ),
            ),
            _SyncCard(c),
            const SizedBox(height: 10),
            _glassList([
              _row(Icons.auto_awesome, 'New AI design', c.startAi),
              _row(
                Icons.design_services_outlined,
                'Design your own',
                c.startDyo,
              ),
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
              // Orders (as ORDERS on the website): the Orders tab, the three ways to order.
              _row(
                Icons.receipt_long_outlined,
                'Orders',
                () => c.go(AppScreen.orderHub),
              ),
              _row(
                Icons.local_shipping_outlined,
                'My orders',
                () => c.go(AppScreen.orders),
              ),
              // 3DEEZI TEAM (as on the website's menu): request a designer, my design requests.
              _row(
                Icons.groups_outlined,
                '3DEEZI TEAM',
                () => Navigator.of(
                  context,
                ).push(MaterialPageRoute<void>(builder: (_) => TeamScreen(c))),
              ),
              // The website's footer pages, opened signed in (same as the site's footer links).
              for (final (icon, label, path) in const [
                (Icons.info_outline, 'About', '/about'),
                (Icons.support_agent_outlined, 'Support', '/support'),
                (Icons.privacy_tip_outlined, 'Privacy', '/privacy'),
                (Icons.description_outlined, 'Terms', '/terms'),
              ])
                _row(
                  icon,
                  label,
                  () => openSitePage(context, c.api.sitePage(path), label),
                ),
              _row(
                Icons.dns_outlined,
                'Server · ${c.api.host}',
                () => editServer(context, c),
              ),
            ]),
          ],
        ),
      ),
    );
  }
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

/// A dark glass card with a thin (1.5 px) cyan rim and 16 px corners (images/344).
class _ThinGlass extends StatelessWidget {
  const _ThinGlass({
    super.key,
    required this.child,
    this.onTap,
    this.radius = 16,
    this.semanticsLabel,
    this.rim = 1.5,
  });
  final double rim;
  final String? semanticsLabel;
  final Widget child;
  final VoidCallback? onTap;
  final double radius;
  @override
  Widget build(BuildContext context) => Semantics(
    button: semanticsLabel != null && onTap != null,
    label: semanticsLabel,
    excludeSemantics: semanticsLabel != null,
    onTap: semanticsLabel == null ? null : onTap,
    child: DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xd8071a2c), Color(0xe0020d18)],
        ),
        // A soft ~4 px glass rim (not a sharp line).
        border: Border.all(color: const Color(0x3836c8ff), width: 4),
        boxShadow: const [BoxShadow(color: Color(0x2236c8ff), blurRadius: 6)],
      ),
      position: DecorationPosition.background,
      child: DecoratedBox(
        // The light glass top edge.
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.white.withValues(alpha: .22),
              Colors.white.withValues(alpha: 0),
            ],
            stops: const [0, .28],
          ),
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(radius),
          clipBehavior: Clip.antiAlias,
          child: InkWell(onTap: onTap, child: child),
        ),
      ),
    ),
  );
}
