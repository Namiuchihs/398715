
import sqlite3
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
import sys

user = sys.argv[1]

conn = sqlite3.connect("database.sqlite")

df = pd.read_sql("SELECT user_id, video_id, watch_time FROM watch_history", conn)

if df.empty:
    print("")
    exit()

matrix = df.pivot_table(index="user_id", columns="video_id", values="watch_time", aggfunc="sum", fill_value=0)

if user not in matrix.index:
    print("")
    exit()

sim = cosine_similarity(matrix)
sim_df = pd.DataFrame(sim, index=matrix.index, columns=matrix.index)

similar = sim_df[user].sort_values(ascending=False)

for u in similar.index:
    if u != user:
        similar_user = u
        break

videos = matrix.loc[similar_user].sort_values(ascending=False)
top = videos.head(5).index.tolist()

print(",".join(map(str, top)))
