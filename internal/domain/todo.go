package domain

import "time"

// export type Todo = {
//   id: number;
//   title: string;
//   completed: boolean;
//   version: number;
//   createdAt: Date;
//   updatedAt: Date;
// };

// Go では大文字始まりが「exported(公開)」、小文字始まりが「unexported(非公開)」
// TypeScript の export キーワードに相当するものが、Go では先頭の大文字/小文字で決まります。
type Todo struct {
	Id        int64
	Title     string
	Completed bool
	Version   int64
	CreatedAt time.Time // time.Time が new Date() みたいなやつらしい
	UpdatedAt time.Time
}
