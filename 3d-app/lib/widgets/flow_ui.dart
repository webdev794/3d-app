import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'ui.dart';

/// Rajdhani display title; [highlight] (a trailing part) is drawn in cyan,
/// as in "HOW DO YOU WANT TO **CREATE?**".
class ScreenTitle extends StatelessWidget {
  const ScreenTitle(
    this.text, {
    super.key,
    this.highlight,
    this.size = 24,
    this.align = TextAlign.center,
  });
  final String text;
  final String? highlight;
  final double size;
  final TextAlign align;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontFamily: 'Rajdhani',
      fontWeight: FontWeight.w700,
      fontSize: size,
      height: 1.05,
      letterSpacing: .6,
      color: Palette.text,
    );
    return Text.rich(
      TextSpan(
        style: style,
        children: [
          TextSpan(text: text.toUpperCase()),
          if (highlight != null)
            TextSpan(
              text: highlight!.toUpperCase(),
              style: style.copyWith(color: Palette.cyan),
            ),
        ],
      ),
      textAlign: align,
    );
  }
}

/// Small spaced caption under titles ("AI SPORTSWEAR DESIGNER").
class Caption extends StatelessWidget {
  const Caption(this.text, {super.key, this.color = Palette.cyan});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    textAlign: TextAlign.center,
    style: TextStyle(
      color: color,
      fontSize: 10,
      letterSpacing: 2.6,
      fontWeight: FontWeight.w600,
    ),
  );
}

/// Back arrow + centred title/child + optional trailing actions.
class TopBar extends StatelessWidget {
  const TopBar({
    super.key,
    this.onBack,
    this.title,
    this.subtitle,
    this.center,
    this.trailing = const [],
    this.leading,
  });
  final VoidCallback? onBack;
  final String? title, subtitle;
  final Widget? center;
  final List<Widget> trailing;

  /// Shown on the left when there is no back arrow (Projects: its Assets button).
  final Widget? leading;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 6, 10, 6),
    child: SizedBox(
      height: subtitle == null ? 48 : 58,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 52),
              child: Center(
                child:
                    center ??
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (title != null) ScreenTitle(title!, size: 21),
                        if (subtitle != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            subtitle!,
                            style: const TextStyle(
                              color: Palette.muted,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ],
                    ),
              ),
            ),
          ),
          if (onBack != null)
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                tooltip: 'Back',
                onPressed: onBack,
                icon: const Icon(
                  Icons.arrow_back_ios_new_rounded,
                  size: 19,
                  color: Palette.text,
                ),
              ),
            ),
          if (onBack == null && leading != null)
            Align(alignment: Alignment.centerLeft, child: leading),
          if (trailing.isNotEmpty)
            Align(
              alignment: Alignment.centerRight,
              child: Row(mainAxisSize: MainAxisSize.min, children: trailing),
            ),
        ],
      ),
    ),
  );
}

/// The top of a tall bottom sheet: a drag handle (drag it down to close), an
/// optional [title] and a close ✕ (top right). iPhones have no Back button,
/// so a sheet that can grow to full height must show its own way out; open
/// it with `useSafeArea: true` so this row stays below the notch.
class SheetTop extends StatelessWidget {
  const SheetTop({super.key, this.title, this.onClose});
  final String? title;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final handle = Container(
      width: 36,
      height: 4,
      decoration: BoxDecoration(
        color: const Color(0xff3b5a69),
        borderRadius: BorderRadius.circular(2),
      ),
    );
    final close = IconButton(
      key: const ValueKey('sheet-close'),
      tooltip: 'Close',
      onPressed: onClose ?? () => Navigator.of(context).maybePop(),
      icon: const Icon(Icons.close, color: Palette.text, size: 22),
    );
    // No title: the handle and the ✕ share one row, as tall as Flutter's own
    // drag handle, so the sheet's content keeps its place.
    if (title == null) {
      return SizedBox(
        height: 48,
        child: Stack(
          children: [
            Center(child: handle),
            Positioned(right: 6, top: 0, bottom: 0, child: close),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 6, 0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          handle,
          Row(
            children: [
              Expanded(
                child: Text(
                  title!,
                  style: const TextStyle(
                    fontFamily: 'Rajdhani',
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              close,
            ],
          ),
        ],
      ),
    );
  }
}

/// The mockup's glowing card: image fill, cyan edge and outer glow.
class GlowCard extends StatelessWidget {
  const GlowCard({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.selected = false,
    this.radius = 16,
    this.glow = true,
  });
  final Widget child;
  final VoidCallback? onTap, onLongPress;
  final bool selected, glow;
  final double radius;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(radius),
      boxShadow: glow
          ? [
              BoxShadow(
                color: Palette.cyan.withValues(alpha: selected ? .5 : .18),
                blurRadius: selected ? 24 : 16,
                spreadRadius: -2,
              ),
            ]
          : null,
    ),
    child: Material(
      color: const Color(0xff07121b),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
        side: BorderSide(
          color: selected
              ? Palette.cyan
              : Palette.cyan.withValues(alpha: glow ? .45 : .2),
          width: selected ? 2.5 : 1.5,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, onLongPress: onLongPress, child: child),
    ),
  );
}

/// A row of chips that stays inside the screen: a few chips shrink a little
/// when they are slightly too wide for a phone; more than [scrollAbove] chips
/// scroll sideways instead, fading out at the edge instead of being cut by it.
class ChipRow extends StatelessWidget {
  const ChipRow({
    super.key,
    required this.children,
    this.padding = const EdgeInsets.symmetric(horizontal: 12),
    this.scrollAbove = 6,
  });
  final List<Widget> children;
  final EdgeInsets padding;
  final int scrollAbove;

  @override
  Widget build(BuildContext context) {
    final spaced = [
      for (var i = 0; i < children.length; i++) ...[
        if (i > 0) const SizedBox(width: 8),
        children[i],
      ],
    ];
    if (children.length <= scrollAbove) {
      return Padding(
        padding: padding,
        child: Align(
          alignment: Alignment.centerLeft,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Row(children: spaced),
          ),
        ),
      );
    }
    return ShaderMask(
      blendMode: BlendMode.dstIn,
      shaderCallback: (rect) => LinearGradient(
        colors: [Colors.white, Colors.white, Colors.white.withValues(alpha: 0)],
        stops: [0, (rect.width - 36) / rect.width, 1],
      ).createShader(rect),
      child: ListView(
        scrollDirection: Axis.horizontal,
        // Room to scroll the last chip clear of the fade.
        padding: padding.copyWith(right: padding.right + 30),
        children: spaced,
      ),
    );
  }
}

/// Pill chip used for quick actions ("Inspire", "Make it black").
class ActionChipPill extends StatelessWidget {
  const ActionChipPill(
    this.label, {
    super.key,
    required this.onTap,
    this.selected = false,
    this.icon,
  });
  final String label;
  final VoidCallback? onTap;
  final bool selected;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Material(
    color: selected ? Palette.cyan.withValues(alpha: .16) : Palette.surface,
    shape: StadiumBorder(
      side: BorderSide(color: selected ? Palette.cyan : Palette.border),
    ),
    child: InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: Palette.cyan),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: selected ? Palette.cyan : Palette.text,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Dots for carousels and onboarding.
class PageDots extends StatelessWidget {
  const PageDots({super.key, required this.count, required this.index});
  final int count, index;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: List.generate(
      count,
      (i) => AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        margin: const EdgeInsets.symmetric(horizontal: 3),
        width: i == index ? 18 : 6,
        height: 6,
        decoration: BoxDecoration(
          color: i == index ? Palette.cyan : Palette.border,
          borderRadius: BorderRadius.circular(4),
        ),
      ),
    ),
  );
}

/// Shows bundled art or in-memory bytes with the same fit.
Widget artImage({
  String? asset,
  Uint8List? bytes,
  BoxFit fit = BoxFit.cover,
  Alignment alignment = Alignment.center,
}) {
  if (bytes != null) {
    return Image.memory(
      bytes,
      fit: fit,
      alignment: alignment,
      gaplessPlayback: true,
      filterQuality: FilterQuality.medium,
    );
  }
  if (asset != null) {
    return Image.asset(
      asset,
      fit: fit,
      alignment: alignment,
      filterQuality: FilterQuality.medium,
    );
  }
  return const ColoredBox(color: Palette.surface2);
}

/// Where a picture comes from: the photo library, the camera, or Files
/// (documents, client picture 214.jpg).
enum PhotoSource { gallery, camera, files }

Future<PhotoSource?> _photoSource(BuildContext context) =>
    showModalBottomSheet<PhotoSource>(
      context: context,
      backgroundColor: Palette.surface,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Photo library'),
              onTap: () => Navigator.pop(sheet, PhotoSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              onTap: () => Navigator.pop(sheet, PhotoSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: const Text('Files'),
              onTap: () => Navigator.pop(sheet, PhotoSource.files),
            ),
          ],
        ),
      ),
    );

/// A file the user picked: its name and bytes.
typedef PickedFile = ({String name, Uint8List bytes});

Future<PickedFile?> _openDocument(
  BuildContext context, {
  bool vectors = false,
}) async {
  try {
    final file = await openFile(
      acceptedTypeGroups: [
        XTypeGroup(
          label: vectors ? 'Artwork' : 'Pictures',
          extensions: [
            if (vectors) ...['pdf', 'svg', 'ai', 'eps'],
            'png',
            'jpg',
            'jpeg',
            'webp',
          ],
          mimeTypes: [
            if (vectors) ...[
              'application/pdf',
              'image/svg+xml',
              'application/postscript',
              'application/illustrator',
            ],
            'image/png',
            'image/jpeg',
            'image/webp',
          ],
          uniformTypeIdentifiers: [
            if (vectors) ...[
              'com.adobe.pdf',
              'public.svg-image',
              'com.adobe.illustrator.ai-image',
              'com.adobe.encapsulated-postscript',
            ],
            'public.png',
            'public.jpeg',
            'org.webmproject.webp',
          ],
        ),
      ],
    );
    if (file == null) return null;
    return (name: file.name, bytes: await file.readAsBytes());
  } on Object {
    if (context.mounted) showToast(context, 'Could not open your files.');
    return null;
  }
}

Future<PickedFile?> _pickImage(BuildContext context, PhotoSource chosen) async {
  try {
    final file = await ImagePicker().pickImage(
      source: chosen == PhotoSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: 1536,
      maxHeight: 1536,
      imageQuality: 88,
    );
    return file == null
        ? null
        : (name: file.name, bytes: await file.readAsBytes());
  } on Exception {
    if (context.mounted) showToast(context, 'Could not open the image picker.');
    return null;
  }
}

/// Lets the user pick a photo (photo library, camera or Files). Returns null
/// if cancelled.
Future<Uint8List?> pickPhoto(
  BuildContext context, {
  ImageSource? source,
}) async {
  final chosen = source == null
      ? await _photoSource(context)
      : source == ImageSource.camera
      ? PhotoSource.camera
      : PhotoSource.gallery;
  if (chosen == null || !context.mounted) return null;
  final picked = chosen == PhotoSource.files
      ? await _openDocument(context)
      : await _pickImage(context, chosen);
  return picked?.bytes;
}

/// Artwork to 3D (task 9.153): a picture from the library or camera, or a
/// vector file (PDF, SVG, AI, EPS) or picture from Files, with its name.
Future<PickedFile?> pickArtwork(BuildContext context) async {
  final chosen = await _photoSource(context);
  if (chosen == null || !context.mounted) return null;
  return chosen == PhotoSource.files
      ? _openDocument(context, vectors: true)
      : _pickImage(context, chosen);
}
