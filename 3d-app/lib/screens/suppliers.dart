import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../money.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart';
import '../widgets/ui.dart';

// Preferred suppliers (task 9.118, as the website's /suppliers, pages/Suppliers.tsx): who makes an order. 3DEEZI (the
// default) and Mantis are the owner's own makers, the "3DEEZI family"; other companies apply on the website's
// /suppliers/apply, pay a listing and are approved by 3DEEZI, then show here and in the order form's "Made by".

/// Opens a supplier's website, or the website's "Become a preferred supplier" page, as the Profile's website rows do
/// (replaced in tests).
Future<void> Function(BuildContext context, String url, String title) openSupplierPage = openSitePage;

/// One maker, as GET /suppliers and GET /orders/options' `suppliers` send it.
@immutable
class Supplier {
  const Supplier({
    required this.id,
    required this.name,
    this.slug,
    this.owner = false,
    this.summary = '',
    this.makes = '',
    this.location = '',
    this.website,
    this.logoUrl,
    this.isDefault = false,
  });

  /// The maker in [json], or null when it has no id or name.
  static Supplier? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'], name = _text(json['name']);
    if (id is! num || name.isEmpty) return null;
    final site = _text(json['website']), logo = _text(json['logo_url']);
    return Supplier(
      id: id.toInt(),
      name: name,
      slug: json['slug'] is String ? json['slug'] as String : null,
      owner: json['owner'] == true,
      summary: _text(json['summary']),
      makes: _text(json['makes']),
      location: _text(json['location']),
      // Only a web address opens (the server adds the https://).
      website: RegExp(r'^https?://', caseSensitive: false).hasMatch(site) ? site : null,
      logoUrl: logo.isEmpty ? null : logo,
      isDefault: json['default'] == true,
    );
  }

  /// The makers in [list], in the server's order (anything that is not a maker is left out).
  static List<Supplier> listOf(Object? list) => [
    if (list is List)
      for (final json in list)
        if (fromJson(json) case final supplier?) supplier,
  ];

  /// 3DEEZI, the maker of every order when the server lists none (an older site, or one not set up yet), as the
  /// server keeps its entry.
  static const threeDeezi = Supplier(
    id: 0,
    name: '3DEEZI',
    slug: '3deezi',
    owner: true,
    summary: 'Designed and made by 3DEEZI.',
    makes: 'Custom sportswear and teamwear',
    isDefault: true,
  );

  final int id;
  final String name, summary, makes, location;
  final String? slug, website, logoUrl;

  /// The owner's own makers (3DEEZI, Mantis): the "3DEEZI family" badge.
  final bool owner;

  /// 3DEEZI: the maker when none is chosen.
  final bool isDefault;

  /// "Sublimated jerseys · Gold Coast, QLD".
  String get about => [makes, location].where((s) => s.isNotEmpty).join(' · ');

  /// Two letters for a maker without a logo, as on the website ("AT" for Acme Teamwear).
  String get initials {
    final letters = name
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => String.fromCharCode(w.runes.first))
        .join()
        .toUpperCase();
    return letters.isEmpty ? '?' : letters;
  }
}

String _text(Object? value) => value == null ? '' : '$value'.trim();

/// "Become a preferred supplier"'s listing prices from GET /suppliers' `prices` ("A$49", "A$490", " (incl. GST)"):
/// "Free" for a price of 0; null without prices.
({String monthly, String yearly, String tax})? listingPrices(Object? prices) {
  if (prices is! Map) return null;
  String? price(Object? amount) {
    final value = double.tryParse(_text(amount));
    if (value == null) return null;
    return value > 0 ? formatMoney(value, prices['currency'], true) : 'Free';
  }

  final monthly = price(prices['monthly']), yearly = price(prices['yearly']);
  if (monthly == null || yearly == null) return null;
  final tax = _text(prices['tax_name']);
  return (monthly: monthly, yearly: yearly, tax: prices['tax_included'] == true && tax.isNotEmpty ? ' (incl. $tax)' : '');
}

/// Who makes an order (its `made_by`), for My orders and the order's page: only a maker other than 3DEEZI, which
/// makes every order placed without a choice (and every order from before the choice existed).
String? madeByOf(Map<String, dynamic> order) {
  final name = _text(order['made_by']);
  return name.isEmpty || name.toUpperCase() == '3DEEZI' ? null : name;
}

/// The glowing dark panel of the website's cards (its glow-panel).
BoxDecoration _panel() => BoxDecoration(
  borderRadius: BorderRadius.circular(16),
  border: Border.all(color: const Color(0x6600d9ed), width: 1.5),
  gradient: const LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xff071623), Color(0xff050d16)],
  ),
  boxShadow: const [BoxShadow(color: Color(0x2600d9ed), blurRadius: 26)],
);

/// Preferred suppliers (the website's /suppliers): Mantis and the approved suppliers as cards (logo, name, the "3DEEZI
/// family" badge, what they make, where they are, Visit website), then "Become a preferred supplier" with the listing
/// prices, which opens the website's form. With no list from the server (an older site, no connection), 3DEEZI alone.
/// Opened from the Home's PREFERRED SUPPLIERS strip and the order form's "See the suppliers".
class SuppliersScreen extends StatefulWidget {
  const SuppliersScreen(this.c, {super.key});
  final AppController c;
  @override
  State<SuppliersScreen> createState() => _SuppliersScreenState();
}

class _SuppliersScreenState extends State<SuppliersScreen> {
  /// The makers on the page (3DEEZI itself is left out, as on the website); null while loading.
  List<Supplier>? _makers;

  /// The listing prices; [_answered]: the server has the page (an older site has no list and no form to open).
  Map<String, dynamic>? _prices;
  bool _answered = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final page = await widget.c.api.suppliers();
      if (!mounted) return;
      setState(() {
        _makers = Supplier.listOf(page['suppliers']).where((s) => !s.isDefault).toList();
        _prices = page['prices'] is Map ? (page['prices'] as Map).cast<String, dynamic>() : null;
        _answered = true;
      });
    } catch (_) {
      // An older site without the list, or no connection: 3DEEZI makes every order (pull down to try again).
      if (mounted) setState(() => _makers ??= const []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final makers = _makers;
    final shown = makers == null ? null : (makers.isEmpty ? const [Supplier.threeDeezi] : makers);
    return Scaffold(
      backgroundColor: Palette.bg,
      appBar: AppBar(backgroundColor: Palette.bg, title: const Text('Preferred suppliers')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: LayoutBuilder(
          builder: (context, box) {
            // Phones fill the width; a tablet keeps the phone's column (560 px at most).
            final side = math.max(16.0, (box.maxWidth - 560) / 2);
            return ListView(
              // Pull to refresh on a short page too.
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(side, 10, side, 32),
              // One item each (the heading, every card), so screen readers get each card on its own.
              children: [
                const _Heading(),
                const SizedBox(height: 22),
                if (shown == null)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else ...[
                  for (final s in shown)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: _SupplierCard(
                        s,
                        api: widget.c.api,
                        onVisit: s.website == null ? null : () => openSupplierPage(context, s.website!, s.name),
                      ),
                    ),
                  if (_answered)
                    _JoinCard(
                      prices: listingPrices(_prices),
                      // The website's form, signed in (it shows "Your listing" to a supplier who applied).
                      onTap: () => openSupplierPage(
                        context,
                        widget.c.api.sitePage('/suppliers/apply'),
                        'Become a preferred supplier',
                      ),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// "Made by makers we trust." and what the page is for.
class _Heading extends StatelessWidget {
  const _Heading();

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Semantics(
        container: true,
        header: true,
        child: const Text.rich(
          TextSpan(
            children: [
              TextSpan(text: 'Made by makers '),
              TextSpan(
                text: 'we trust.',
                style: TextStyle(color: Palette.cyan),
              ),
            ],
          ),
          style: TextStyle(
            fontFamily: 'Rajdhani',
            fontWeight: FontWeight.w700,
            fontSize: 34,
            height: 1.05,
            color: Colors.white,
          ),
        ),
      ),
      const SizedBox(height: 10),
      Semantics(
        container: true,
        child: const Text(
          'Teamwear makers who work with 3DEEZI. Choose one under “Made by” when you fill in an order form; 3DEEZI '
          'makes it when you don’t choose.',
          style: TextStyle(fontSize: 13, height: 1.6, color: Color(0xff8fa0b5)),
        ),
      ),
    ],
  );
}

/// One maker's card: logo, name and badge, short text, Makes, Where and Visit website.
class _SupplierCard extends StatelessWidget {
  const _SupplierCard(this.s, {required this.api, this.onVisit});
  final Supplier s;
  final ApiClient api;
  final VoidCallback? onVisit;

  @override
  Widget build(BuildContext context) => Container(
    key: ValueKey('supplier-${s.slug ?? s.id}'),
    padding: const EdgeInsets.all(20),
    decoration: _panel(),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // The card's words as one node for screen readers, beside its Visit website button.
        Semantics(
          container: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SupplierLogo(s, api: api),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.name,
                          style: const TextStyle(
                            fontFamily: 'Rajdhani',
                            fontWeight: FontWeight.w700,
                            fontSize: 24,
                            height: 1.1,
                            color: Colors.white,
                          ),
                        ),
                        if (s.owner) const Padding(padding: EdgeInsets.only(top: 6), child: _FamilyBadge()),
                      ],
                    ),
                  ),
                ],
              ),
              if (s.summary.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(s.summary, style: const TextStyle(fontSize: 13, height: 1.6, color: Color(0xffc4d0df))),
              ],
              if (s.makes.isNotEmpty || s.location.isNotEmpty) const SizedBox(height: 12),
              if (s.makes.isNotEmpty) _Fact(Icons.checkroom_outlined, 'Makes', s.makes),
              if (s.location.isNotEmpty) _Fact(Icons.place_outlined, 'Where', s.location),
            ],
          ),
        ),
        if (onVisit != null) ...[
          const SizedBox(height: 12),
          OutlinedButton(
            key: ValueKey('supplier-visit-${s.id}'),
            onPressed: onVisit,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: BorderSide(color: Palette.cyan.withValues(alpha: .65), width: 1.3),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Visit website', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                SizedBox(width: 10),
                Icon(Icons.open_in_new, size: 16),
              ],
            ),
          ),
        ],
      ],
    ),
  );
}

/// "3DEEZI family": Mantis (which owns 3DEEZI) and 3DEEZI itself.
class _FamilyBadge extends StatelessWidget {
  const _FamilyBadge();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
    decoration: BoxDecoration(
      color: const Color(0x1400d9ed),
      borderRadius: BorderRadius.circular(99),
      border: Border.all(color: const Color(0x3300d9ed)),
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.verified_outlined, size: 13, color: Color(0xff7cf0ff)),
        SizedBox(width: 5),
        Flexible(
          child: Text(
            '3DEEZI family',
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: .4, color: Color(0xff7cf0ff)),
          ),
        ),
      ],
    ),
  );
}

/// A card's "Makes" or "Where" line.
class _Fact extends StatelessWidget {
  const _Fact(this.icon, this.label, this.value);
  final IconData icon;
  final String label, value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 86,
          child: Row(
            children: [
              Icon(icon, size: 15, color: Palette.muted),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Palette.muted),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(value, style: const TextStyle(fontSize: 12.5, height: 1.35, color: Color(0xffe6eef8))),
        ),
      ],
    ),
  );
}

/// A maker's logo on a white tile, or two letters on a dark one (no logo, or it could not load); 3DEEZI shows its
/// wordmark there.
class SupplierLogo extends StatelessWidget {
  const SupplierLogo(this.supplier, {super.key, this.api, this.size = 64});
  final Supplier supplier;

  /// The server the app talks to: the logo is fetched from it.
  final ApiClient? api;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = supplier.logoUrl;
    final empty = DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff0a3140), Color(0xff231a55)],
        ),
      ),
      child: Center(
        child: supplier.slug == '3deezi'
            ? BrandLogo(width: size * .78)
            : Text(
                supplier.initials,
                style: TextStyle(
                  fontFamily: 'Rajdhani',
                  fontWeight: FontWeight.w700,
                  fontSize: size * .34,
                  letterSpacing: .8,
                  color: const Color(0xffbff7ff),
                ),
              ),
      ),
    );
    final shape = BorderRadius.circular(size * .19);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(borderRadius: shape),
        foregroundDecoration: BoxDecoration(
          borderRadius: shape,
          border: Border.all(color: const Color(0x1affffff)),
        ),
        clipBehavior: Clip.antiAlias,
        child: url == null
            ? empty
            : Image.network(
                api?.serverUrl(url) ?? url,
                fit: BoxFit.contain,
                frameBuilder: (context, child, frame, sync) => ColoredBox(
                  color: Colors.white,
                  child: Padding(padding: const EdgeInsets.all(6), child: child),
                ),
                errorBuilder: (context, error, stack) => empty,
              ),
      ),
    );
  }
}

/// "Become a preferred supplier" with the listing prices: opens the website's form.
class _JoinCard extends StatelessWidget {
  const _JoinCard({required this.prices, required this.onTap});
  final ({String monthly, String yearly, String tax})? prices;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = prices;
    const strong = TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Colors.white);
    const plain = TextStyle(fontSize: 13.5, height: 1.5, color: Color(0xffdfe9f5));
    return Container(
      key: const ValueKey('become-supplier'),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x5500d9ed), width: 1.5),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff05171f), Color(0xff0e0d24)],
        ),
        boxShadow: const [BoxShadow(color: Color(0x2600d9ed), blurRadius: 26)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // The card's words as one node for screen readers, beside its button.
          Semantics(
            container: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: const Color(0x1a00d9ed), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.storefront_outlined, color: Palette.cyan, size: 26),
                ),
                const SizedBox(height: 16),
                const Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: 'Become a preferred '),
                      TextSpan(
                        text: 'supplier',
                        style: TextStyle(color: Palette.cyan),
                      ),
                    ],
                  ),
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontWeight: FontWeight.w700,
                    fontSize: 26,
                    height: 1.1,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Make teamwear? Get listed here and in the order form’s “Made by” choice for every team ordering on '
                  '3DEEZI.',
                  style: TextStyle(fontSize: 13, height: 1.6, color: Palette.muted),
                ),
                if (p != null) ...[
                  const SizedBox(height: 12),
                  if (p.monthly == 'Free' && p.yearly == 'Free')
                    const Text('Listing is free at the moment.', key: Key('listing-prices'), style: plain)
                  else
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: p.monthly, style: strong),
                          const TextSpan(text: ' a month or '),
                          TextSpan(text: p.yearly, style: strong),
                          TextSpan(text: ' a year${p.tax}'),
                        ],
                      ),
                      key: const Key('listing-prices'),
                      style: plain,
                    ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          GradientButton(
            key: const ValueKey('become-supplier-open'),
            label: 'Become a preferred supplier',
            icon: Icons.arrow_forward,
            compact: true,
            onPressed: onTap,
          ),
        ],
      ),
    );
  }
}

/// The order form's "Made by" (the website's MadeByField): 3DEEZI (the default), Mantis, then the approved suppliers,
/// with what the chosen one makes and where, and See the suppliers. [value] null is 3DEEZI. Nothing shows when there
/// is nothing to choose (fewer than two makers, e.g. an older site): the order is then 3DEEZI's.
class MadeByField extends StatelessWidget {
  const MadeByField({
    super.key,
    required this.makers,
    required this.value,
    required this.onChanged,
    this.onSeeSuppliers,
  });

  /// GET /orders/options' `suppliers`: 3DEEZI first.
  final List<Supplier> makers;
  final int? value;
  final ValueChanged<int?> onChanged;
  final VoidCallback? onSeeSuppliers;

  /// 3DEEZI (else the first maker): the maker when none is chosen.
  static Supplier? fallbackOf(List<Supplier> makers) =>
      makers.where((s) => s.isDefault).firstOrNull ?? makers.firstOrNull;

  /// The maker chosen: [value] while it is offered, else 3DEEZI (a choice no longer offered goes back to 3DEEZI, as
  /// on the website).
  static Supplier? chosenOf(List<Supplier> makers, int? value) =>
      makers.where((s) => s.id == value).firstOrNull ?? fallbackOf(makers);

  /// The `supplier_id` to send: null for 3DEEZI (or when there is no choice).
  static int? idToSend(List<Supplier> makers, int? value) {
    if (makers.length < 2) return null;
    final chosen = chosenOf(makers, value);
    return chosen == null || chosen.id == fallbackOf(makers)?.id ? null : chosen.id;
  }

  @override
  Widget build(BuildContext context) {
    if (makers.length < 2) return const SizedBox.shrink();
    final fallback = fallbackOf(makers)!;
    final chosen = chosenOf(makers, value)!;
    final hint = chosen.id == fallback.id
        ? 'Made by 3DEEZI unless you choose one of our preferred suppliers.'
        : chosen.about.isEmpty
        ? 'One of our preferred suppliers.'
        : chosen.about;
    return Column(
      key: const Key('made-by'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(height: 22),
        DropdownButtonFormField<int>(
          // Shown again when the choice changes from outside.
          key: ValueKey('made-by-${chosen.id}'),
          isExpanded: true,
          initialValue: chosen.id,
          decoration: const InputDecoration(labelText: 'Made by', border: OutlineInputBorder(), isDense: true),
          items: [
            for (final s in makers)
              DropdownMenuItem(
                value: s.id,
                child: Text('${s.name}${s.id == fallback.id ? ' (default)' : ''}', overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (id) => onChanged(id == null || id == fallback.id ? null : id),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 6),
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(hint, key: const Key('made-by-hint'), style: const TextStyle(color: Palette.muted, fontSize: 12)),
              if (onSeeSuppliers != null)
                TextButton(
                  onPressed: onSeeSuppliers,
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                    textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                  child: const Text('See the suppliers'),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
