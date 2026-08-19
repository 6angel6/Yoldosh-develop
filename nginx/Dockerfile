FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
EXPOSE 443
EXPOSE 81
CMD ["nginx", "-g", "daemon off;"]