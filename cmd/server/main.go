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
		w.Write([]byte("hello"))
	})

	log.Fatal(http.ListenAndServe(":8080", mux))
}
