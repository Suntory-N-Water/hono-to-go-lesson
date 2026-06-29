package main

import (
	"log"
	"net/http"
)

// HTTP サーバーを作ってみる
func main() {
	// TypeScript の const mux = ... 相当
	mux := http.NewServeMux()
	// go は w, r みたいな一文字変数が多い
	// TypeScript は request みたいにするけど、短いスコープなら短い名前みたいな文化があるっぽい
	// どうやらこういう理屈らしい
	// Go の理屈:
	//  - 「型がドキュメントの代わり」 — w http.ResponseWriter と書けば w が何か明白
	//  - 長い名前はノイズ — 5 行のループの中で responseWriter を 10 回書くより w の方が読める
	//  - スコープが広がる = 名前も伸ばす — パッケージレベルの公開関数の引数は userID, request のように普通の長さに
	// * は ポインタ を意味するらしい。ようわからん
	mux.HandleFunc("GET /hello", func(w http.ResponseWriter, r *http.Request) {
		// TypeScript 風に書くと new TextEncoder().encode("hello") 相当。文字列を生のバイト列に変換しているだけ。
		w.Write([]byte("hello"))
	})

	// // Node.js でいう
	//  try {
	//    await server.listen(8080)
	//  } catch (e) {
	//    console.error(e)
	//    process.exit(1)
	//  }
	//  を 1 行に圧縮したもの。Go には例外が無いので、戻り値の error を握りつぶさず必ず処理する法則
	//  その「最終行で握る」最短形がこれです。
	log.Fatal(http.ListenAndServe(":8080", mux))
}
