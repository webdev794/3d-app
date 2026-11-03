<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{ $number }} · v{{ $version }} · Order confirmation form</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9eef3; font: 13px/1.4 Arial, Helvetica, sans-serif; color: #0b1622; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; gap: 10px; justify-content: center; padding: 10px; background: #071628; }
  .bar button { border: 0; border-radius: 999px; padding: 10px 20px; font-weight: 700; cursor: pointer; background: #2fd2ff; color: #04121f; }
  .page { width: 210mm; min-height: 270mm; margin: 14px auto; background: #fff; padding: 0 0 18mm; position: relative; box-shadow: 0 2px 14px rgba(0,0,0,.15); page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .band { display: flex; align-items: center; justify-content: space-between; padding: 14px 22px; background: linear-gradient(90deg, #04101d, #0b2d4f); }
  .band img { height: 30px; }
  .band span { color: #8fe6ff; font-weight: 700; letter-spacing: .12em; font-size: 11px; }
  .inner { padding: 16px 22px 0; }
  h1 { margin: 0; font-size: 22px; letter-spacing: .04em; }
  .badge { display: inline-block; margin-top: 6px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .06em; background: #fff4d6; color: #8a5a00; border: 1px solid #f0c060; }
  .badge.ok { background: #dcfbe9; color: #0b6b3a; border-color: #46c98a; }
  .meta { float: right; text-align: right; font-size: 12px; color: #43515f; }
  .meta b { color: #0b1622; }
  .strip { clear: both; display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; margin: 14px 0; background: #cfe3ef; border: 1px solid #cfe3ef; border-radius: 8px; overflow: hidden; }
  .strip div { background: #f4f9fc; padding: 8px 10px; font-size: 11.5px; }
  .strip small { display: block; color: #5b6b79; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
  h2 { margin: 12px 0 10px; font-size: 18px; letter-spacing: .03em; }
  h2 span { color: #0aa5d8; }
  .pics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .pics figure { margin: 0; border: 1px solid #d6e3ec; border-radius: 10px; overflow: hidden; background: #0b1622; aspect-ratio: 1 / 1; display: grid; place-items: center; position: relative; }
  .pics img { width: 100%; height: 100%; object-fit: contain; }
  .pics figcaption { position: absolute; left: 8px; top: 8px; background: rgba(4,16,29,.8); color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; letter-spacing: .08em; }
  .pics .none { color: #9fb3c3; font-size: 12px; padding: 20px; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
  th, td { border: 1px solid #d6e3ec; padding: 6px 8px; text-align: left; }
  th { background: #eef6fb; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #34495a; }
  .sizes th, .sizes td { text-align: center; }
  .sub { margin-top: 10px; text-align: right; font-weight: 700; font-size: 14px; }
  .total td { font-weight: 700; font-size: 14px; background: #eef6fb; }
  .foot { position: absolute; left: 22px; right: 22px; bottom: 6mm; display: flex; justify-content: space-between; font-size: 10.5px; color: #6a7987; border-top: 1px solid #d6e3ec; padding-top: 6px; }
  @media print { body { background: #fff; } .bar { display: none; } .page { margin: 0; box-shadow: none; width: auto; min-height: 0; height: 271mm; } }
  @media (max-width: 820px) { .page { width: auto; margin: 10px; } .strip { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<div class="bar"><button type="button" onclick="window.print()">Save as PDF / Print</button></div>
@php($pages = count($garments) + 1)
@foreach ($garments as $i => $g)
<section class="page">
  <div class="band"><img src="{{ $logo }}" alt="3DEEZI"><span>ORDER CONFIRMATION</span></div>
  <div class="inner">
    <div class="meta">Order no <b>{{ $number }}</b><br>Version <b>{{ $version }}</b></div>
    <h1>ORDER CONFIRMATION FORM</h1>
    <span class="badge {{ $approved ? 'ok' : '' }}">{{ $status }}</span>
    <div class="strip">
      <div><small>Team</small>{{ $team }}</div>
      <div><small>Contact</small>{{ $contact }}</div>
      <div><small>Supplier</small>{{ $supplier }}</div>
      <div><small>Delivery details</small>{{ $delivery }}</div>
      <div><small>Requested date</small>{{ $requested }}</div>
    </div>
    <h2><span>{{ $g['no'] }}</span> / {{ strtoupper($g['title']) }}</h2>
    <div class="pics">
      <figure><figcaption>FRONT</figcaption>@if ($g['front'])<img src="{{ $g['front'] }}" alt="Front of {{ $g['name'] }}">@else<div class="none">The front mockup is prepared by 3DEEZI.</div>@endif</figure>
      <figure><figcaption>BACK</figcaption>@if ($g['back'])<img src="{{ $g['back'] }}" alt="Back of {{ $g['name'] }}">@else<div class="none">The back mockup is prepared by 3DEEZI.</div>@endif</figure>
    </div>
    <table>
      <tbody>
      @foreach ($g['details'] as $label => $value)
        <tr><th style="width:30%">{{ $label }}</th><td>{{ $value }}</td></tr>
      @endforeach
      </tbody>
    </table>
    <table class="sizes">
      <thead><tr>@foreach ($g['sizes'] as $size => $n)<th>{{ $size }}</th>@endforeach<th>Total</th></tr></thead>
      <tbody><tr>@foreach ($g['sizes'] as $size => $n)<td>{{ $n }}</td>@endforeach<td><b>{{ $g['total'] }}</b></td></tr></tbody>
    </table>
    @if ($g['players'])
    <table>
      <thead><tr><th>Name</th><th>Number</th><th>Size</th></tr></thead>
      <tbody>@foreach ($g['players'] as $p)<tr><td>{{ $p['name'] ?? '' }}</td><td>{{ $p['number'] ?? '' }}</td><td>{{ $p['size'] ?? '' }}</td></tr>@endforeach</tbody>
    </table>
    @endif
    <div class="sub">Garment subtotal: {{ $g['total'] }} {{ $g['total'] === 1 ? 'piece' : 'pieces' }}</div>
  </div>
  <div class="foot"><span>{{ $number }} · version {{ $version }}</span><span>Page {{ $i + 1 }} of {{ $pages }}</span></div>
</section>
@endforeach
<section class="page">
  <div class="band"><img src="{{ $logo }}" alt="3DEEZI"><span>ORDER CONFIRMATION</span></div>
  <div class="inner">
    <div class="meta">Order no <b>{{ $number }}</b><br>Version <b>{{ $version }}</b></div>
    <h1>OVERALL ORDER SUMMARY</h1>
    <span class="badge {{ $approved ? 'ok' : '' }}">{{ $status }}</span>
    <table>
      <thead><tr><th>#</th><th>Garment</th><th>Design</th><th>Pieces</th></tr></thead>
      <tbody>
      @foreach ($garments as $g)
        <tr><td>{{ $g['no'] }}</td><td>{{ $g['title'] }}</td><td>{{ $g['name'] }}</td><td>{{ $g['total'] }}</td></tr>
      @endforeach
        <tr class="total"><td></td><td>TOTAL</td><td></td><td>{{ $total }}</td></tr>
      </tbody>
    </table>
    @if ($notes)
    <table><tbody><tr><th style="width:30%">Notes for your supplier</th><td>{{ $notes }}</td></tr></tbody></table>
    @endif
    <h2>Approval record</h2>
    <table>
      <tbody>
        <tr><th style="width:30%">Status</th><td>{{ $status }}</td></tr>
        <tr><th>Approved by</th><td>{{ $approved_by ?? '—' }}</td></tr>
        <tr><th>Approved at</th><td>{{ $approved_at ?? '—' }}</td></tr>
      </tbody>
    </table>
  </div>
  <div class="foot"><span>{{ $number }} · version {{ $version }}</span><span>Page {{ $pages }} of {{ $pages }}</span></div>
</section>
</body>
</html>
