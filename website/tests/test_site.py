import hashlib
import json
import re
import unittest
from pathlib import Path
from urllib.parse import urlsplit

SITE = Path(__file__).resolve().parents[1]


class SiteIntegrityTest(unittest.TestCase):
    def load_data(self):
        return json.loads((SITE / "assets/classification-data.json").read_text())

    def load_model_data(self):
        return json.loads((SITE / "assets/model-results.json").read_text())

    def test_classification_data_is_unchanged(self):
        path = SITE / "assets/classification-data.json"
        self.assertEqual(
            hashlib.sha256(path.read_bytes()).hexdigest(),
            "0409841abd91f5b53b77c5d28fb166560d0771ab06fe81f76118d591915a6c04",
        )

    def test_model_results_contract(self):
        data = self.load_model_data()
        benchmark = data["benchmark"]
        self.assertEqual(benchmark["name"], "OmniDAS")
        self.assertEqual(benchmark["scenarios"], 6)
        self.assertEqual(benchmark["records"], 17372)
        self.assertEqual(benchmark["storedScalars"], 52408848768)
        self.assertEqual(benchmark["labelsOrRegions"], 30)
        self.assertEqual(len(benchmark["taskTracks"]), 5)
        self.assertIn("classification", benchmark["taskTracks"])
        self.assertIn("self-supervised denoising", benchmark["taskTracks"])

        self.assertEqual(data["method"]["name"], "DAS-NanoNet")
        rows = {row["scenario"]: row for row in data["classification"]}
        self.assertEqual(len(rows), 7)
        expected = {
            "External six-class benchmark": (1391, 99.68),
            "Perimeter Security": (10667, 98.56),
            "Campus": (15035, 99.16),
            "Industrial Fiber Optic Microphone": (932, 97.53),
            "Industrial Straight-run Fiber Optic Cable": (933, 99.50),
            "Environmental Sound time domain": (1355, 87.00),
            "Environmental Sound time-frequency": (42076, 96.33),
        }
        for scenario, (parameters, accuracy) in expected.items():
            with self.subTest(scenario=scenario):
                self.assertEqual(rows[scenario]["parameters"], parameters)
                self.assertEqual(rows[scenario]["accuracy"], accuracy)
                self.assertEqual(set(rows[scenario]), {"scenario", "parameters", "accuracy"})

        downstream = {item["id"]: item for item in data["downstream"]}
        expected_tasks = {
            "traffic-localization": (29086, {"IoU": 79.03}),
            "task-compression": (10839, {"Accuracy": 99.52, "Size reduction": 11182.08}),
            "waveform-compression": (13419, {"Mean PSNR": 28.556, "Size reduction": 3.74}),
            "denoising": (10561, {
                "Median raw-denoised correlation": 0.925,
                "Background-to-anomaly attenuation difference": 2.66,
            }),
        }
        self.assertEqual(set(downstream), set(expected_tasks))
        for task, (parameters, results) in expected_tasks.items():
            with self.subTest(task=task):
                self.assertEqual(downstream[task]["parameters"], parameters)
                self.assertEqual(
                    {result["label"]: result["value"] for result in downstream[task]["results"]},
                    results,
                )
        self.assertEqual(
            {item["scenario"]: item["latencyUs"] for item in data["deployment"]},
            {"Industrial Fiber Optic Microphone": 7.90, "Perimeter Security": 8.46},
        )

    def test_model_figure_assets(self):
        page = SITE / "methods/index.html"
        figures = re.findall(r'(?:src|data-lightbox-src)="([^"]+\.webp)"', page.read_text())
        self.assertEqual(set(figures), {
            "../assets/images/methods/fig4-classification.webp",
            "../assets/images/methods/fig4-other-tasks.webp",
            "../assets/images/methods/fig3a-method.webp",
        })
        for path in figures:
            with self.subTest(path=path):
                self.assertTrue((page.parent / path).is_file(), path)

    def test_dataset_order_and_counts(self):
        data = self.load_data()["datasets"]
        self.assertEqual(
            list(data),
            ["industrial", "perimeter-security", "campus", "environmental-sound", "seismic"],
        )
        self.assertEqual([data[key]["records"] for key in data], [443, 1386, 10082, 2000, 16])
        self.assertEqual([len(data[key]["classes"]) for key in data], [2, 8, 6, 10, 2])
        self.assertEqual(sum(len(item.get("audio", [])) for item in data.values()), 29)

    def test_referenced_classification_media_exists(self):
        data = self.load_data()["datasets"]
        paths = []
        for item in data.values():
            if item.get("feature"):
                paths.extend(item["feature"].values())
            paths.extend(audio["src"] for audio in item.get("audio", []))
        for path in paths:
            with self.subTest(path=path):
                self.assertTrue((SITE / path).is_file())

    def test_only_approved_images_are_shipped(self):
        approved = {
            "benchmark-visualization-card.webp",
            "benchmark-visualization-full.webp",
            "campus-feature-card.webp",
            "campus-feature-full.webp",
            "dataset-statistics-card.webp",
            "dataset-statistics-full.webp",
            "environmental-feature-card.webp",
            "environmental-feature-full.webp",
            "industrial-feature-card.webp",
            "industrial-feature-full.webp",
            "overview-card.webp",
            "overview-full.webp",
            "perimeter-feature-card.webp",
            "perimeter-feature-full.webp",
            "traffic-segmentation-card.webp",
            "traffic-segmentation-full.webp",
        }
        images = SITE / "assets/images"
        existing = {path.relative_to(images).as_posix() for path in images.rglob("*") if path.is_file()}
        self.assertEqual(existing & approved, approved)
        self.assertTrue({
            "main-dataset.webp",
            "methods/fig4-classification.webp",
            "methods/fig4-other-tasks.webp",
            "methods/fig3a-method.webp",
        } <= existing)

    def test_home_content_and_task_boundaries(self):
        home = (SITE / "index.html").read_text()
        for text in (
            "OmniDAS Benchmark",
            "Sensing scenarios",
            "17,372",
            "52.41B",
            "Class or region labels",
            "Task tracks",
        ):
            self.assertIn(text, home)
        self.assertGreaterEqual(home.count('href="classification/"'), 1)
        self.assertIn('href="methods/#traffic-localization"', home)
        self.assertGreaterEqual(home.count('href="methods/"'), 1)
        self.assertNotIn('href="compression', home.lower())
        self.assertNotIn('href="denoising', home.lower())
        self.assertNotIn("Coming soon", home)
        self.assertNotIn('aria-disabled="true"', home)
        self.assertIn(
            '<img src="assets/images/main-dataset.webp" '
            'alt="OmniDAS dataset scale, sensing scenarios, representative signals and tasks" loading="lazy">',
            home,
        )
        for column in ("Scenario", "Records", "Dimensions", "Duration"):
            self.assertIn(f"<th scope=\"col\">{column}</th>", home)
        for column in ("Train", "Validation", "Test", "Embargo", "Gauge length"):
            self.assertNotIn(f"<th scope=\"col\">{column}</th>", home)
        self.assertNotIn('id="acquisition"', home)
        self.assertNotIn('id="highlights"', home)
        self.assertNotIn("DAS-NanoNet highlights", home)
        self.assertNotIn("Compact models, practical performance", home)
        self.assertNotIn("main-overview.webp", home)

    def test_home_uses_omnidas_source_content(self):
        home = (SITE / "index.html").read_text()
        for text in (
            "OmniDAS",
            "classification",
            "Fixed-region localization",
            "Task-oriented compression",
            "Waveform compression",
            "Self-supervised denoising",
            "Dataset collection",
            "main-dataset.webp",
        ):
            self.assertIn(text, home)
        self.assertNotIn("SceneDAS", home)

    def test_methods_page_contract(self):
        page_path = SITE / "methods/index.html"
        self.assertTrue(page_path.is_file())
        page = page_path.read_text()
        script = (SITE / "assets/site.js").read_text()
        data = (SITE / "assets/model-results.json").read_text()
        for text in (
            "OmniDAS",
            "DAS-NanoNet",
            "Classification",
            "Fixed-region localization",
            "Task-oriented compression",
            "Waveform-reconstruction compression",
            "Self-supervised denoising",
            '"parameters": 10839',
            "Method overview",
            "model-results.json",
        ):
            self.assertIn(text, page + script + data)
        for section_id in ("workflow", "classification-results", "downstream-results", "deployment"):
            self.assertIn(f'id="{section_id}"', page)
        for container in ("data-method-classification", "data-method-downstream", "data-method-deployment"):
            self.assertIn(container, page)
        self.assertIn('["Scenario", "Parameters", "Accuracy"]', script)
        self.assertIn("function initMethods", script)

    def test_legacy_traffic_page_redirects_to_dataset_tab(self):
        page = (SITE / "segmentation/index.html").read_text()
        self.assertIn("OmniDAS", page)
        self.assertIn('../classification/#traffic', page)
        self.assertRegex(page, r'<meta\s+http-equiv="refresh"\s+content="0;\s*url=\.\./classification/#traffic"')
        self.assertIn('href="../classification/#traffic"', page)
        self.assertNotIn('id="traffic-results"', page)
        self.assertNotIn('id="lightbox"', page)

    def test_primary_navigation_has_three_destinations(self):
        for path in ("index.html", "classification/index.html", "methods/index.html"):
            page = (SITE / path).read_text()
            navigation = re.search(r'<nav class="site-nav"[^>]*>(.*?)</nav>', page, re.DOTALL)
            self.assertIsNotNone(navigation)
            with self.subTest(page=path):
                self.assertEqual(
                    re.findall(r'<a[^>]*>([^<]+)</a>', navigation.group(1)),
                    ["Overview", "Datasets", "Results &amp; Method"],
                )
                self.assertNotIn("segmentation/", navigation.group(1))

    def test_classification_model_context_contract(self):
        page = (SITE / "classification/index.html").read_text()
        script = (SITE / "assets/site.js").read_text()
        for text in (
            "OmniDAS",
            "Dataset introduction",
            "Classification results",
            "data-classification-model-context",
            "model-results.json",
        ):
            self.assertIn(text, page + script)
        self.assertIn("renderClassificationModelContext", script)
        self.assertIn("Promise.all", script)
        self.assertIn("modelResults.classification", script)

    def test_classification_shell_and_script_contract(self):
        page = (SITE / "classification/index.html").read_text()
        script = (SITE / "assets/site.js").read_text()
        self.assertIn('data-root=".."', page)
        for key in ("industrial", "perimeter-security", "campus", "environmental-sound", "seismic", "traffic"):
            self.assertIn(f'data-dataset="{key}"', page)
        for name in ("renderDataset", "activateDataset", "stopAudio"):
            self.assertIn(f"function {name}", script)
        self.assertIn("window.location.hash", script)
        self.assertIn('controlsList = "nodownload"', script)
        for key in ("industrial", "perimeter-security", "campus", "environmental-sound", "seismic", "traffic"):
            self.assertIn(f'id="dataset-tab-{key}"', page)
        self.assertIn('panel.setAttribute("aria-labelledby", tab.id)', script)
        self.assertIn("traffic: trafficDataset", script)
        self.assertIn("regionLabelCount: 2", script)
        self.assertIn('records: 3445', script)
        self.assertIn('dimensions: "2,048 x 2,775"', script)
        self.assertIn('"Localization result"', script)
        self.assertIn('["Scenario", "Parameters", "IoU"]', script)
        self.assertIn('if (dataset.classes?.length)', script)

    def test_audio_cards_have_only_approved_visible_metadata_and_an_accessible_name(self):
        script = (SITE / "assets/site.js").read_text()
        self.assertRegex(
            script,
            r'const audio = document\.createElement\("audio"\);\n'
            r'      audio\.src = `\$\{root\}/\$\{sample\.src\}`;',
        )
        for metadata in (
            "Sample ID: ${sample.sampleId}",
            "Duration: ${dataset.duration}",
            "Sample rate: ${dataset.sampleRate}",
        ):
            self.assertIn(metadata, script)
        self.assertIn('audio.setAttribute("aria-label",', script)
        self.assertIn(
            "`${dataset.name}, ${sample.label}, Sample ID: ${sample.sampleId}, "
            "Duration: ${dataset.duration}, Sample rate: ${dataset.sampleRate}`",
            script,
        )
        self.assertNotRegex(script, r"(?i)(?:textContent|innerText|innerHTML)\s*=\s*sample\.(?:name|filename|src)")

    def test_lightbox_contract(self):
        script = (SITE / "assets/site.js").read_text()
        pages = [(SITE / path).read_text() for path in (
            "index.html", "classification/index.html", "methods/index.html"
        )]
        for name in ("openLightbox", "closeLightbox", "stepLightbox"):
            self.assertIn(f"function {name}", script)
        self.assertIn('event.key === "Escape"', script)
        self.assertIn('event.key === "ArrowLeft"', script)
        self.assertIn('event.key === "ArrowRight"', script)
        self.assertEqual(sum(page.count('id="lightbox"') for page in pages), 3)

    def test_site_contains_no_forbidden_content_or_routes(self):
        text = "\n".join(path.read_text(errors="ignore") for path in SITE.rglob("*") if path.suffix in {".html", ".js", ".json"})
        for forbidden in (
            "Coming soon", "SOTA", "state of the art", "protocol", "common-grid",
            "DARTS", "DB-TS", "DSTC", "HBG", "CRC32", "searchAudit",
            "no paired clean DAS reference", "measurement scope",
        ):
            self.assertNotIn(forbidden.lower(), text.lower())
        self.assertFalse((SITE / "compression").exists())
        self.assertFalse((SITE / "denoising").exists())
        self.assertNotIn("现场", text)
        for page in SITE.rglob("*.html"):
            with self.subTest(page=page.name):
                self.assertNotRegex(page.read_text(), r"(?i)<[^>]+\sdownload(?:\s*=|\s*>)")
        with self.subTest(kind="pdf"):
            self.assertFalse([path for path in SITE.rglob("*") if path.suffix.lower() == ".pdf"])

    def test_all_local_html_references_exist(self):
        site_root = SITE.resolve()
        for page in SITE.rglob("*.html"):
            content = page.read_text()
            for ref in re.findall(r'(?:src|href|data-lightbox-src)="([^"#]+)"', content):
                if ref.startswith(("http://", "https://", "mailto:")):
                    continue
                target = (page.parent / urlsplit(ref).path).resolve()
                with self.subTest(page=page.name, ref=ref):
                    self.assertTrue(target.is_relative_to(site_root), target)
                    self.assertTrue(target.exists(), target)


if __name__ == "__main__":
    unittest.main()
