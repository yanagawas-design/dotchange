# DotCraft (ドットクラフト) - リアルタイム本格ピクセルアート（ドット絵）コンバーター & エディター

画像をアップロードして、リアルタイムに本格ピクセルアート（ドット絵）に変換・微調整できるWebアプリケーションです。

🌐 **公開URL (GitHub Pages):**  
**[https://yanagawas-design.github.io/dotchange/](https://yanagawas-design.github.io/dotchange/)**

---

## ✨ 主な機能・特徴

1. **変換サイズ選択**: 32×32px / 64×64px / 128×128px（アスペクト比維持 / 正方形）
2. **使用色数（カラーパレット制限 / Median Cut法）**:
   - **8色 / 16色 / 32色 / 64色 / 128色 / 無制限 (フルカラー)**
   - 「無制限」時は元画像の色を100%保持し、色数を落とすほどパキッとしたレトロな表現になります。
3. **組織的ディザリング（Bayer行列による網点表現）**:
   - ON/OFF 切り替え ＆ 強度スライダー (10%〜100%)
   - 少ない色数でも滑らかな陰影や立体感を表現できます。
4. **背景透過の自動クリーンアップ**:
   - 透過PNGの輪郭のモヤモヤ・ゴミをアルファ50%で2値化してきれいに除去。
5. **ドット単位での手動微調整（簡易エディタ）**:
   - ✏️ ペン / 💧 スポイト / 🧹 消しゴム / 🎨 カラーピッカー / ↩️ Undo・🔁 Redo
6. **2種類のPNGダウンロード**:
   - 実サイズPNG保存（32x32等） ＆ ぼやけない高解像度PNG保存（約512〜800px相当）
7. **完全クライアントサイド完結**:
   - サーバー送信なし・HTML5 Canvas上で高速処理。プライベートな画像も安心です。

---

## 🚀 GitHub Pages へのデプロイ手順

このプロジェクトはビルドツール不要の純粋な HTML / CSS / JavaScript 構成となっており、すべてのリソースが相対パス (`./style.css`, `./script.js`) で指定されているため、リポジトリにプッシュするだけでサブディレクトリ配下でもそのまま正常に動作します。

```bash
# 1. 変更をコミット
git add .
git commit -m "Configure for GitHub Pages deployment"

# 2. リポジトリへプッシュ (mainブランチ)
git push origin main
```

### GitHub側の設定
1. GitHubリポジトリの **[Settings]** タブを開く
2. 左メニューの **[Pages]** を選択
3. **Build and deployment** の Source で **Deploy from a branch** を選択
4. Branch に **`main`**、フォルダに **`/ (root)`** を選択して **[Save]**
5. 数十秒〜数分で **[https://yanagawas-design.github.io/dotchange/](https://yanagawas-design.github.io/dotchange/)** に公開されます。
